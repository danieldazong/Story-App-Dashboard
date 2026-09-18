"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { serverSupabase } from "@/lib/server-supabase";
import { getAppSettings } from "@/lib/queries";
import { extractDocxTextFromBuffer } from "@/lib/docx";
import {
  hasReadableText,
  normaliseScriptText,
} from "@/lib/script-normalise";
import { logActivity } from "@/app/actions/activity";
import {
  actionError,
  actionOk,
  describeDbError,
  type ActionResult,
} from "@/app/actions/types";

/**
 * The `scripts` bucket's own file_size_limit, and the binding one here.
 *
 * Unlike audio — where the plan's fixed 50 MB ceiling binds below the bucket's
 * 100 MB — this bucket is configured at 5 MB, well under the platform limit. A
 * 5,000-word chapter is a few tens of kilobytes, so this is generous. Keep it
 * in step with the bucket, or an operator sees a limit the platform refuses
 * (see AGENTS.md, prompt 16 notes).
 */
const MAX_SCRIPT_BYTES = 5 * 1024 * 1024;

/**
 * Extension → MIME, matching the `scripts` bucket's allowed_mime_types.
 *
 * The bucket is the real boundary; this exists so a declared file name can be
 * checked before a token is minted, and so the upload carries a Content-Type
 * the bucket will accept.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
 * Mints a signed upload URL for a new script object.
 *
 * The file body never passes through this server — the browser PUTs straight to
 * Supabase Storage using this URL, exactly as covers do. Verified against the
 * live project before this was built: mint, PUT a real file, HTTP 200,
 * server-side download returns the same bytes.
 *
 * Accepted formats come from `app_settings`, not constants, so the constraint
 * line, the client-side rejection and this check cannot disagree — the defect
 * fixed for audio in prompt 16 and avoided here by construction.
 */
export async function createScriptUploadUrl(input: {
  bookId: string;
  chapterId: string;
  fileName: string;
  sizeBytes: number;
}): Promise<
  ActionResult<{ path: string; token: string; contentType: string }>
> {
  await requireAdmin();

  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid script file.");
  }

  const { bookId, chapterId, fileName, sizeBytes } = parsed.data;
  const client = await serverSupabase();

  const settings = await getAppSettings(client);
  if (!settings.ok) return actionError(settings.error);

  const extension = extensionOf(fileName);
  const accepted = settings.data.acceptedScriptFormats.map((format) =>
    format.toLowerCase(),
  );

  if (!accepted.includes(extension)) {
    return actionError(
      `Scripts must be ${accepted.join(" or ")}. This file is ${extension || "an unrecognised type"}.`,
    );
  }

  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) {
    return actionError(
      `${extension} is configured in Settings but not supported for upload yet.`,
    );
  }

  if (sizeBytes > MAX_SCRIPT_BYTES) {
    return actionError(
      `Scripts must be ${MAX_SCRIPT_BYTES / 1024 / 1024} MB or smaller.`,
    );
  }

  const path = `${bookId}/${chapterId}/${crypto.randomUUID()}${extension}`;

  // Chapter check and token mint are independent, so one round trip rather than
  // two — the same reasoning as createCoverUploadUrl.
  const [chapterCheck, signed] = await Promise.all([
    client
      .from("chapters")
      .select("id")
      .eq("id", chapterId)
      .eq("book_id", bookId)
      .maybeSingle(),
    client.storage.from("scripts").createSignedUploadUrl(path),
  ]);

  if (chapterCheck.error) return actionError(describeDbError(chapterCheck.error));
  if (!chapterCheck.data) return actionError("That chapter no longer exists.");
  if (signed.error) {
    return actionError(`Couldn't start the upload: ${signed.error.message}`);
  }

  return actionOk({
    path: signed.data.path,
    token: signed.data.token,
    contentType,
  });
}

const extractSchema = z.object({
  bookId: z.string().uuid("Missing book id"),
  chapterId: z.string().uuid("Missing chapter id"),
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string(),
  path: z.string().trim().min(1, "Missing script path"),
  fileName: z.string().trim().min(1, "Missing file name"),
  previousPath: z.string().trim().nullable().optional(),
});

/**
 * Downloads the uploaded object, extracts its text, normalises it, and persists
 * the result on the chapter row.
 *
 * Extraction runs HERE rather than in the browser so that normalisation and the
 * empty-text rejection are a boundary rather than a convention: a client can
 * send anything to updateChapter, so whatever a browser extracts cannot define
 * what `script_text` becomes.
 *
 * Called only after the object exists in storage — a row must never reference a
 * path for an upload that did not complete.
 */
export async function extractAndSetChapterScript(
  input: z.infer<typeof extractSchema>,
): Promise<ActionResult<{ wordCountSource: string }>> {
  const actorId = await requireAdmin();

  const parsed = extractSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid script.");
  }

  const v = parsed.data;
  const client = await serverSupabase();

  const { data: blob, error: downloadError } = await client.storage
    .from("scripts")
    .download(v.path);

  if (downloadError || !blob) {
    return actionError(
      `Couldn't read the uploaded file: ${downloadError?.message ?? "not found"}`,
    );
  }

  const extension = extensionOf(v.fileName);

  let raw: string;
  try {
    raw =
      extension === ".docx"
        ? await extractDocxTextFromBuffer(
            Buffer.from(await blob.arrayBuffer()),
          )
        : await blob.text();
  } catch (error) {
    // Logged, not swallowed. This call site passed an ArrayBuffer to a mammoth
    // option that only exists in its browser build, so every .docx failed here
    // too — and the bare `catch {}` that used to sit here hid the reason.
    console.error(
      `Script extraction failed for ${v.fileName} (chapter ${v.chapterNumber}):`,
      error,
    );
    // A corrupt or mislabelled file. Specific, because "upload failed" would
    // send an operator to check their connection over a bad document.
    return actionError(
      "Couldn't read the text from this file. It may be corrupt or not a real document.",
    );
  }

  const text = normaliseScriptText(raw, {
    chapterNumber: v.chapterNumber,
    chapterTitle: v.chapterTitle,
  });

  // An empty script_text must mean "no script", never "a script that failed to
  // parse" — every screen reads presence from nullability, so persisting this
  // would show the chapter as complete while its prose silently vanished.
  if (!hasReadableText(text)) {
    // The object is already in storage but nothing will point at it, so clean
    // it up rather than leave an orphan behind a rejected extraction.
    await client.storage.from("scripts").remove([v.path]);
    return actionError("No readable text found in this file.");
  }

  const { data, error } = await client
    .from("chapters")
    .update({
      script_path: v.path,
      script_file_name: v.fileName,
      script_text: text,
    })
    .eq("id", v.chapterId)
    .select("number")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "The script couldn't be saved — the chapter may have been removed, or your account lacks permission.",
    );
  }

  // Upload new, repoint row, delete old — never delete first. A failed delete
  // orphans a file; deleting first risks a chapter with no script. Same
  // ordering as setBookCover and setChapterAudio.
  if (v.previousPath && v.previousPath !== v.path) {
    const { error: removeError } = await client.storage
      .from("scripts")
      .remove([v.previousPath]);
    if (removeError) {
      console.warn(
        `Script replaced but the previous object was not deleted (${v.previousPath}): ${removeError.message}`,
      );
    }
  }

  await logActivity(
    client,
    actorId,
    `Chapter ${String(data.number).padStart(2, "0")} script uploaded`,
    { bookId: v.bookId, chapterId: v.chapterId },
  );

  revalidatePath(`/books/${v.bookId}/chapters/${v.chapterNumber}`);
  revalidatePath(`/books/${v.bookId}`);
  revalidatePath("/books");
  // Deliberately including "/", against the general rule in Performance Rules.
  // The Dashboard queue derives from script_text presence and is exactly what
  // this changes, and the cost is small relative to an upload. Do not
  // reintroduce it to the text-save paths.
  revalidatePath("/");

  return actionOk({ wordCountSource: "script_text" });
}

/** Removes a partial object after a cancelled or abandoned upload. */
export async function discardScriptUpload(
  path: string,
): Promise<ActionResult> {
  await requireAdmin();
  if (!path.trim()) return actionError("Missing script path.");

  const client = await serverSupabase();
  const { error } = await client.storage.from("scripts").remove([path]);
  if (error) return actionError(`Couldn't clean up: ${error.message}`);
  return actionOk(undefined);
}

export async function removeChapterScript(input: {
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
    .select("script_path")
    .eq("id", v.chapterId)
    .maybeSingle();

  const { data, error } = await client
    .from("chapters")
    .update({
      script_path: null,
      script_file_name: null,
      script_text: null,
    })
    .eq("id", v.chapterId)
    .select("number")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "The script couldn't be removed — the chapter may have been removed, or your account lacks permission.",
    );
  }

  // Only some rows have a stored object: 38 chapters predate prompt 17 and have
  // text with no source file. Nothing to delete for those, and that is a
  // legitimate state rather than a failure.
  if (existing?.script_path) {
    const { error: removeError } = await client.storage
      .from("scripts")
      .remove([existing.script_path]);
    if (removeError) {
      console.warn(
        `Script row cleared but the object was not deleted (${existing.script_path}): ${removeError.message}`,
      );
    }
  }

  await logActivity(
    client,
    actorId,
    `Chapter ${String(data.number).padStart(2, "0")} script removed`,
    { bookId: v.bookId, chapterId: v.chapterId },
  );

  revalidatePath(`/books/${v.bookId}/chapters/${v.chapterNumber}`);
  revalidatePath(`/books/${v.bookId}`);
  revalidatePath("/books");
  revalidatePath("/");

  return actionOk(undefined);
}
