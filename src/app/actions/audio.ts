"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { serverSupabase } from "@/lib/server-supabase";
import { getAppSettings } from "@/lib/queries";
import { logActivity } from "@/app/actions/activity";
import {
  actionError,
  actionOk,
  describeDbError,
  type ActionResult,
} from "@/app/actions/types";

/**
 * Extension → MIME, for the formats the `audio` bucket accepts.
 *
 * The bucket's `allowed_mime_types` is the real boundary; this map exists so a
 * declared file name can be checked against the operator's configured format
 * list before a token is minted. Keep the two in step — see AGENTS.md on the
 * three-sources-disagreeing failure that cost a migration on covers.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index).toLowerCase();
}

const uploadRequestSchema = z.object({
  bookId: z.string().uuid("Missing book id"),
  chapterId: z.string().uuid("Missing chapter id"),
  fileName: z.string().trim().min(1, "Missing file name"),
  sizeBytes: z.number().int().positive("File is empty"),
});

/**
 * Mints a signed upload token for a new narration object.
 *
 * The file body never passes through this server — the browser uploads straight
 * to Supabase Storage's resumable endpoint using this token in the
 * `x-signature` header (prompt 16, and AGENTS.md's Upload Rules).
 *
 * Accepted formats and the size ceiling come from `app_settings`, not from
 * constants, so the constraint line, the client-side rejection and this check
 * cannot disagree. This is the boundary; the browser check is a courtesy.
 *
 * The path is always fresh (`<bookId>/<chapterId>/<uuid><ext>`). Paths are
 * immutable and never reused on replace: overwriting serves stale audio through
 * the CDN until propagation catches up, which for narration means a reader
 * hearing the previous take.
 */
export async function createAudioUploadUrl(input: {
  bookId: string;
  chapterId: string;
  fileName: string;
  sizeBytes: number;
}): Promise<ActionResult<{ path: string; contentType: string }>> {
  await requireAdmin();

  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid audio file.");
  }

  const { bookId, chapterId, fileName, sizeBytes } = parsed.data;
  const client = await serverSupabase();

  const settings = await getAppSettings(client);
  if (!settings.ok) return actionError(settings.error);

  const extension = extensionOf(fileName);
  const accepted = settings.data.acceptedAudioFormats.map((format) =>
    format.toLowerCase(),
  );

  if (!accepted.includes(extension)) {
    return actionError(
      `Narration must be ${accepted.join(" or ")}. This file is ${extension || "an unrecognised type"}.`,
    );
  }

  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) {
    // The format is configured but this server has no MIME for it, so the
    // bucket would reject the upload with a less useful error. Say so here.
    return actionError(
      `${extension} is configured in Settings but not supported for upload yet.`,
    );
  }

  const maxBytes = settings.data.maxAudioSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    return actionError(
      `Narration must be ${settings.data.maxAudioSizeMb} MB or smaller.`,
    );
  }

  const path = `${bookId}/${chapterId}/${crypto.randomUUID()}${extension}`;

  const { data: chapter, error: chapterError } = await client
    .from("chapters")
    .select("id")
    .eq("id", chapterId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (chapterError) return actionError(describeDbError(chapterError));
  if (!chapter) return actionError("That chapter no longer exists.");

  // No signed upload token is minted, deliberately.
  //
  // createSignedUploadUrl was the original design and it CANNOT work here,
  // verified against the live project: the resumable endpoint rejects the
  // token in `x-signature` ("Invalid Compact JWS"), and passing it as a bearer
  // authenticates but then fails `audio_insert` with "new row violates
  // row-level security policy" — a signed upload token carries no Clerk
  // identity, so `is_admin()` is false.
  //
  // The browser therefore authorises the transfer with the operator's own
  // Clerk session token, exactly as createSupabaseClient does everywhere else,
  // and RLS stays the boundary. This action remains the validation boundary
  // for format and size, and it owns the path so the browser cannot choose
  // where bytes land.
  return actionOk({ path, contentType });
}

const persistSchema = z.object({
  bookId: z.string().uuid("Missing book id"),
  chapterId: z.string().uuid("Missing chapter id"),
  chapterNumber: z.number().int().positive(),
  path: z.string().trim().min(1, "Missing audio path"),
  fileName: z.string().trim().min(1, "Missing file name"),
  sizeBytes: z.number().int().positive(),
  // Null when `loadedmetadata` reported Infinity or NaN. A file with no
  // measurable duration is still a valid upload — see prompt 16.
  durationSeconds: z.number().int().min(0).nullable(),
  previousPath: z.string().trim().nullable().optional(),
});

/**
 * Points the chapter row at an uploaded narration object.
 *
 * Called only after the object exists in storage — a row must never reference a
 * path for an upload that did not complete.
 *
 * When `durationSeconds` is null both duration columns are nulled together, so
 * the row never claims a source for a measurement that did not happen.
 */
export async function setChapterAudio(
  input: z.infer<typeof persistSchema>,
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  const parsed = persistSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid narration.");
  }

  const v = parsed.data;
  const client = await serverSupabase();

  const { data, error } = await client
    .from("chapters")
    .update({
      audio_path: v.path,
      audio_file_name: v.fileName,
      audio_size_bytes: v.sizeBytes,
      audio_duration_seconds: v.durationSeconds,
      audio_duration_source: v.durationSeconds === null ? null : "detected",
    })
    .eq("id", v.chapterId)
    .select("number, title")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "The narration couldn't be saved — the chapter may have been removed, or your account lacks permission.",
    );
  }

  // Order matters: the row now points at the new object, so removing the old
  // one can only orphan a file, never leave the chapter with no audio. Mirrors
  // setBookCover. A failed delete is logged and tolerated.
  if (v.previousPath && v.previousPath !== v.path) {
    const { error: removeError } = await client.storage
      .from("audio")
      .remove([v.previousPath]);
    if (removeError) {
      console.warn(
        `Narration replaced but the previous object was not deleted (${v.previousPath}): ${removeError.message}`,
      );
    }
  }

  await logActivity(
    client,
    actorId,
    `Chapter ${String(data.number).padStart(2, "0")} narration uploaded`,
    { bookId: v.bookId, chapterId: v.chapterId },
  );

  revalidatePath(`/books/${v.bookId}/chapters/${v.chapterNumber}`);
  revalidatePath(`/books/${v.bookId}`);
  revalidatePath("/books");
  // Deliberately including "/" here, against the general rule in Performance
  // Rules. The Dashboard's MISSING AUDIO tile and its attention queue are
  // exactly what this upload changes, and a ~1s revalidation is noise against a
  // transfer that already took 30s+. The rule is about cost relative to the
  // operation, not a blanket ban — do not reintroduce it to the text-save paths.
  revalidatePath("/");

  return actionOk(undefined);
}

/**
 * Mints a short-lived signed URL so the operator can play a narration back.
 *
 * The `audio` bucket is private, so there is no public URL to render — verified
 * against the live project, where `/object/public/audio/...` returns 400 and a
 * signed URL returns 200. Signing happens here rather than in the mappers so
 * that list screens, which render duration and presence but never stream, do
 * not mint signed URLs nobody uses — on this database that would be a round
 * trip per row.
 */
export async function createAudioPlaybackUrl(
  path: string,
): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();

  if (!path.trim()) return actionError("Missing audio path.");

  const client = await serverSupabase();
  const { data, error } = await client.storage
    .from("audio")
    .createSignedUrl(path, 60 * 60);

  if (error) return actionError(`Couldn't load the narration: ${error.message}`);
  return actionOk({ url: data.signedUrl });
}

/** Removes a partial object after a cancelled upload. Leaves no row change. */
export async function discardAudioUpload(path: string): Promise<ActionResult> {
  await requireAdmin();

  if (!path.trim()) return actionError("Missing audio path.");

  const client = await serverSupabase();
  const { error } = await client.storage.from("audio").remove([path]);

  if (error) return actionError(`Couldn't clean up: ${error.message}`);
  return actionOk(undefined);
}

export async function removeChapterAudio(input: {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
}): Promise<ActionResult> {
  const actorId = await requireAdmin();

  const parsed = z
    .object({
      bookId: z.string().uuid(),
      chapterId: z.string().uuid(),
      chapterNumber: z.number().int().positive(),
    })
    .safeParse(input);

  if (!parsed.success) return actionError("Missing chapter id.");

  const v = parsed.data;
  const client = await serverSupabase();

  const { data: existing } = await client
    .from("chapters")
    .select("audio_path")
    .eq("id", v.chapterId)
    .maybeSingle();

  const { data, error } = await client
    .from("chapters")
    .update({
      audio_path: null,
      audio_file_name: null,
      audio_size_bytes: null,
      audio_duration_seconds: null,
      audio_duration_source: null,
    })
    .eq("id", v.chapterId)
    .select("number")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "The narration couldn't be removed — the chapter may have been removed, or your account lacks permission.",
    );
  }

  if (existing?.audio_path) {
    const { error: removeError } = await client.storage
      .from("audio")
      .remove([existing.audio_path]);
    if (removeError) {
      console.warn(
        `Narration row cleared but the object was not deleted (${existing.audio_path}): ${removeError.message}`,
      );
    }
  }

  await logActivity(
    client,
    actorId,
    `Chapter ${String(data.number).padStart(2, "0")} narration removed`,
    { bookId: v.bookId, chapterId: v.chapterId },
  );

  revalidatePath(`/books/${v.bookId}/chapters/${v.chapterNumber}`);
  revalidatePath(`/books/${v.bookId}`);
  revalidatePath("/books");
  revalidatePath("/");

  return actionOk(undefined);
}
