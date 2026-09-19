"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { serverSupabase } from "@/lib/server-supabase";
import { logActivity } from "@/app/actions/activity";
import {
  actionError,
  actionOk,
  describeDbError,
  type ActionResult,
} from "@/app/actions/types";

/**
 * Accepted cover types. Mirrors the `covers` bucket's allowed_mime_types and
 * the card's constraint line — all three must agree (AGENTS.md).
 */
const ACCEPTED_COVER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB, matching the bucket limit

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const uploadRequestSchema = z.object({
  bookId: z.string().uuid("Missing book id"),
  fileName: z.string().trim().min(1, "Missing file name"),
  contentType: z.enum(ACCEPTED_COVER_TYPES, {
    message: "Covers must be a JPG, PNG or WebP image.",
  }),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_COVER_BYTES, "Covers must be 2 MB or smaller."),
});

/**
 * Mints a signed upload URL for a new cover object.
 *
 * The file body never passes through the server — the browser uploads straight
 * to Supabase Storage using this URL (prompt 15, and AGENTS.md's Upload Rules).
 * The browser also validates type and size, but that is a courtesy; this check
 * is the boundary.
 *
 * The path is always fresh (`covers/<bookId>/<uuid>.<ext>`). Paths are immutable
 * and never reused on replace: overwriting serves stale content through the CDN
 * until propagation catches up.
 */
export async function createCoverUploadUrl(input: {
  bookId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ path: string; token: string }>> {
  await requireAdmin();

  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid cover file.");
  }

  const { bookId, contentType } = parsed.data;
  const client = await serverSupabase();

  const extension = EXTENSION_BY_TYPE[contentType] ?? "jpg";
  const path = `${bookId}/${crypto.randomUUID()}.${extension}`;

  // The existence check and the signed-URL mint are independent, so they run
  // together rather than one after the other. Serially these were two full
  // round trips (~2.4s observed on this database); in parallel it is one.
  //
  // Minting before the check is confirmed is safe: the URL authorises writing
  // one object at one path, storage RLS is the real boundary (AGENTS.md,
  // Supabase Rules), and an unused signed URL simply expires. The check still
  // gates whether the caller is told to proceed.
  const [bookCheck, signed] = await Promise.all([
    client.from("books").select("id").eq("id", bookId).maybeSingle(),
    client.storage.from("covers").createSignedUploadUrl(path),
  ]);

  if (bookCheck.error) return actionError(describeDbError(bookCheck.error));
  if (!bookCheck.data) {
    return actionError("That story no longer exists.");
  }

  if (signed.error) {
    return actionError(`Couldn't start the upload: ${signed.error.message}`);
  }

  return actionOk({ path: signed.data.path, token: signed.data.token });
}

const persistSchema = z.object({
  bookId: z.string().uuid("Missing book id"),
  path: z.string().trim().min(1, "Missing cover path"),
  fileName: z.string().trim().min(1, "Missing file name"),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  previousPath: z.string().trim().nullable().optional(),
});

/**
 * Points the book row at an uploaded cover.
 *
 * Called only after the object exists in storage — a row must never reference a
 * path for an upload that did not complete.
 */
export async function setBookCover(
  input: z.infer<typeof persistSchema>,
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  const parsed = persistSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid cover.");
  }

  const v = parsed.data;
  const client = await serverSupabase();

  const { data, error } = await client
    .from("books")
    .update({
      cover_path: v.path,
      cover_file_name: v.fileName,
      cover_size_bytes: v.sizeBytes,
      cover_width: v.width,
      cover_height: v.height,
    })
    .eq("id", v.bookId)
    .select("title")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "The cover couldn't be saved — the story may have been removed, or your account lacks permission.",
    );
  }

  // Order matters: the row now points at the new object, so removing the old
  // one can only orphan a file, never leave the book with no cover. A failed
  // delete is logged and tolerated rather than failing the whole operation.
  if (v.previousPath && v.previousPath !== v.path) {
    const { error: removeError } = await client.storage
      .from("covers")
      .remove([v.previousPath]);
    if (removeError) {
      console.warn(
        `Cover replaced but the previous object was not deleted (${v.previousPath}): ${removeError.message}`,
      );
    }
  }

  await logActivity(client, actorId, `${data.title} — cover updated`, {
    bookId: v.bookId,
  });

  revalidatePath(`/books/${v.bookId}`);
  revalidatePath("/books");

  return actionOk(undefined);
}

export async function removeBookCover(
  bookId: string,
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  if (!z.string().uuid().safeParse(bookId).success) {
    return actionError("Missing story id.");
  }

  const client = await serverSupabase();

  const { data: existing } = await client
    .from("books")
    .select("cover_path")
    .eq("id", bookId)
    .maybeSingle();

  const { data, error } = await client
    .from("books")
    .update({
      cover_path: null,
      cover_file_name: null,
      cover_size_bytes: null,
      cover_width: null,
      cover_height: null,
    })
    .eq("id", bookId)
    .select("title")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "The cover couldn't be removed — the story may have been removed, or your account lacks permission.",
    );
  }

  if (existing?.cover_path) {
    const { error: removeError } = await client.storage
      .from("covers")
      .remove([existing.cover_path]);
    if (removeError) {
      console.warn(
        `Cover row cleared but the object was not deleted (${existing.cover_path}): ${removeError.message}`,
      );
    }
  }

  await logActivity(client, actorId, `${data.title} — cover removed`, {
    bookId,
  });

  revalidatePath(`/books/${bookId}`);
  revalidatePath("/books");

  return actionOk(undefined);
}
