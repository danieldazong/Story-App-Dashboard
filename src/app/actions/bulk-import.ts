"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { serverSupabase } from "@/lib/server-supabase";
import { getAppSettings } from "@/lib/queries";
import { extractDocxTextFromBuffer } from "@/lib/docx";
import { hasReadableText, normaliseScriptText } from "@/lib/script-normalise";
import { evaluateBatch, type BatchRow } from "@/lib/bulk-import";
import { logActivity } from "@/app/actions/activity";
import {
  actionError,
  actionOk,
  describeDbError,
  type ActionResult,
} from "@/app/actions/types";

/**
 * Bulk script import.
 *
 * Three per-row actions plus one finalize, called from the client so each
 * file's body goes browser -> storage directly. Pushing 148 files through a
 * single Server Action would mean 148 file bodies through the app server.
 *
 * Per-row actions deliberately do NOT revalidate: `finalizeBulkImport` is the
 * batch's only cache invalidation, and its only activity_log entry. A 148-file
 * import must not write 148 log rows or fire 148 revalidations.
 */

/** Matches app/actions/scripts.ts — the `scripts` bucket's own limit. */
const MAX_SCRIPT_BYTES = 5 * 1024 * 1024;

/** Extension -> MIME, matching the `scripts` bucket's allowed_mime_types. */
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

/**
 * Per-row failures the client must NOT retry.
 *
 * A retry of a duplicate number or an unreadable file fails identically every
 * time; retrying just multiplies the wait. Transient failures (network, 5xx)
 * carry no kind and are retryable.
 */
export type ImportFailureKind =
  | "duplicate_number"
  | "unreadable_file"
  | "permission";

export type ImportTarget = {
  chapterId: string;
  path: string;
  token: string;
  contentType: string;
  /** Set for a replacement, so the old object can be deleted after repointing. */
  previousScriptPath: string | null;
};

const rowSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  number: z.number().int().positive(),
  title: z.string().trim().min(1),
  status: z.enum([
    "new_chapter",
    "replaces_script",
    "duplicate_number",
    "unreadable_file",
  ]),
  blocked: z.boolean(),
  wordCount: z.number().int().nonnegative().nullable(),
});

const preflightSchema = z.object({
  bookId: z.string().uuid("Missing book id"),
  rows: z.array(rowSchema).min(1, "No files to import").max(150),
});

export type PreflightResult = {
  rows: BatchRow[];
  /** True when the server's evaluation differs from the client's preview. */
  corrected: boolean;
  freeChaptersAtStart: number;
  defaultChapterAccess: "free" | "locked";
};

/**
 * Re-evaluates the batch server-side against freshly-read chapter numbers.
 *
 * The client already ran `evaluateBatch` to render the preview, but another
 * operator may have added chapters since the files were dropped. Running the
 * same pure function against current numbers is what stops the preview and the
 * import disagreeing.
 */
export async function preflightBulkImport(input: {
  bookId: string;
  rows: BatchRow[];
}): Promise<ActionResult<PreflightResult>> {
  await requireAdmin();

  const parsed = preflightSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid batch.");
  }

  const { bookId, rows } = parsed.data;
  const client = await serverSupabase();

  const [bookRead, chapterRead, settings] = await Promise.all([
    client.from("books").select("id, default_chapter_access").eq("id", bookId).maybeSingle(),
    client.from("chapters").select("number").eq("book_id", bookId),
    getAppSettings(client),
  ]);

  if (bookRead.error) return actionError(describeDbError(bookRead.error));
  if (!bookRead.data) {
    return actionError("That story no longer exists, or you can't access it.");
  }
  if (chapterRead.error) return actionError(describeDbError(chapterRead.error));
  if (!settings.ok) return actionError(settings.error);

  const existingNumbers = (chapterRead.data ?? []).map((row) => row.number);
  const highestExisting =
    existingNumbers.length === 0 ? 0 : Math.max(...existingNumbers);

  // The operator's edits are authoritative for number and title; the SERVER is
  // authoritative for status. Feeding the client's rows back through the same
  // pure function is what makes the two agree.
  const authoritative = evaluateBatch(
    rows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      numberOverride: row.number,
      titleOverride: row.title,
      unreadable: row.status === "unreadable_file",
      wordCount: row.wordCount,
    })),
    existingNumbers,
    highestExisting,
  );

  const byId = new Map(rows.map((row) => [row.id, row]));
  const corrected = authoritative.some(
    (row) => byId.get(row.id)?.status !== row.status,
  );

  return actionOk({
    rows: authoritative,
    corrected,
    freeChaptersAtStart: settings.data.freeChaptersAtStart,
    defaultChapterAccess: bookRead.data.default_chapter_access,
  });
}

const targetSchema = z.object({
  batchId: z.string().uuid("Missing batch id"),
  bookId: z.string().uuid("Missing book id"),
  number: z.number().int().positive(),
  title: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  sizeBytes: z.number().int().positive("File is empty"),
  replaces: z.boolean(),
});

/**
 * Creates (or resolves) the chapter row and mints its signed upload URL.
 *
 * Called once per importable row, BEFORE the file is uploaded — a row must
 * exist before an object is written under its id, the same ordering every other
 * upload path in this app follows.
 */
export async function createImportTarget(
  input: z.infer<typeof targetSchema>,
): Promise<ActionResult<ImportTarget> & { kind?: ImportFailureKind }> {
  await requireAdmin();

  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid row.");
  }

  const v = parsed.data;
  const client = await serverSupabase();

  const extension = extensionOf(v.fileName);
  const contentType = MIME_BY_EXTENSION[extension];
  if (!contentType) {
    return {
      ...actionError(`${extension || "That file type"} can't be imported.`),
      kind: "unreadable_file",
    };
  }
  if (v.sizeBytes > MAX_SCRIPT_BYTES) {
    return {
      ...actionError(
        `Scripts must be ${MAX_SCRIPT_BYTES / 1024 / 1024} MB or smaller.`,
      ),
      kind: "unreadable_file",
    };
  }

  let chapterId: string;
  let previousScriptPath: string | null = null;

  if (v.replaces) {
    const { data, error } = await client
      .from("chapters")
      .select("id, script_path")
      .eq("book_id", v.bookId)
      .eq("number", v.number)
      .maybeSingle();

    if (error) return actionError(describeDbError(error));
    if (!data) {
      // The chapter vanished between preflight and now.
      return {
        ...actionError(`Chapter ${v.number} no longer exists.`),
        kind: "duplicate_number",
      };
    }

    // Title and access are deliberately untouched on a replacement — the
    // operator is importing text, not renaming a chapter they already have.
    chapterId = data.id;
    previousScriptPath = data.script_path;
  } else {
    // Access resolution mirrors createChapter: the book's own default is the
    // per-serial paywall shape, and free_chapters_at_start opens the opening
    // run regardless. Not reimplemented differently — see AGENTS.md on two
    // surfaces for one job drifting.
    const [bookRead, settings] = await Promise.all([
      client
        .from("books")
        .select("default_chapter_access")
        .eq("id", v.bookId)
        .maybeSingle(),
      getAppSettings(client),
    ]);

    if (bookRead.error) return actionError(describeDbError(bookRead.error));
    if (!bookRead.data) return actionError("That story no longer exists.");

    const freeAtStart = settings.ok ? settings.data.freeChaptersAtStart : 0;
    const access =
      v.number <= freeAtStart ? "free" : bookRead.data.default_chapter_access;

    const { data, error } = await client
      .from("chapters")
      .insert({
        book_id: v.bookId,
        number: v.number,
        title: v.title,
        access,
        // Null until ingest persists the extracted text. A chapter that exists
        // with no script is a real, recoverable state — it shows in the
        // Dashboard's Needs attention queue.
        script_text: null,
        script_file_name: null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ...actionError(`Chapter ${v.number} already exists.`),
          kind: "duplicate_number",
        };
      }
      const message = describeDbError(error);
      return {
        ...actionError(message),
        ...(error.code === "42501" ? { kind: "permission" as const } : {}),
      };
    }

    chapterId = data.id;
  }

  const path = `${v.bookId}/${chapterId}/${crypto.randomUUID()}${extension}`;
  const signed = await client.storage.from("scripts").createSignedUploadUrl(path);

  if (signed.error) {
    return actionError(`Couldn't start the upload: ${signed.error.message}`);
  }

  return actionOk({
    chapterId,
    path: signed.data.path,
    token: signed.data.token,
    contentType,
    previousScriptPath,
  });
}

const ingestSchema = z.object({
  batchId: z.string().uuid(),
  bookId: z.string().uuid(),
  chapterId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  chapterTitle: z.string().trim().min(1),
  path: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  previousScriptPath: z.string().trim().nullable(),
});

/**
 * Downloads the uploaded object, extracts and normalises its text, and persists
 * it on the chapter row.
 *
 * Shares the exact pipeline `extractAndSetChapterScript` uses — same extractor,
 * same normaliser, same readable-text gate — so a chapter imported in bulk and
 * one uploaded singly produce byte-identical `script_text` for the same file.
 */
export async function ingestImportedScript(
  input: z.infer<typeof ingestSchema>,
): Promise<ActionResult<{ wordCount: number }> & { kind?: ImportFailureKind }> {
  await requireAdmin();

  const parsed = ingestSchema.safeParse(input);
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
    // Log the real exception. A bare `catch {}` here swallowed
    // `Could not find file in options` — a wrong mammoth call shape that broke
    // every .docx — and surfaced it as a generic "text not imported", which
    // read like a bad document and cost several rounds of guessing.
    console.error(
      `Bulk import: .docx extraction failed for ${v.fileName} (chapter ${v.chapterNumber}):`,
      error,
    );
    await client.storage.from("scripts").remove([v.path]);
    return {
      ...actionError(
        "Chapter created, but this file couldn't be read. It may be corrupt or password-protected. Fix in the chapter editor.",
      ),
      kind: "unreadable_file",
    };
  }

  const text = normaliseScriptText(raw, {
    chapterNumber: v.chapterNumber,
    chapterTitle: v.chapterTitle,
  });

  if (!hasReadableText(text)) {
    // The object is in storage but nothing will reference it. The CHAPTER stays
    // — deleting it would discard a row the operator may have edited, and a
    // chapter with no script is recoverable from the chapter editor.
    //
    // Deliberately worded differently from the extraction failure above: "read
    // the file but found nothing in it" and "could not read the file at all"
    // send an operator to different remedies, and sharing one message meant the
    // screen could not distinguish them.
    await client.storage.from("scripts").remove([v.path]);
    return {
      ...actionError(
        "Chapter created, but this file contains no text. Fix in the chapter editor.",
      ),
      kind: "unreadable_file",
    };
  }

  const { data, error } = await client
    .from("chapters")
    .update({
      script_path: v.path,
      script_file_name: v.fileName,
      script_text: text,
    })
    .eq("id", v.chapterId)
    .select("id")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "The script couldn't be saved — the chapter may have been removed, or your account lacks permission.",
    );
  }

  // Repoint first, delete second. A failed delete orphans a file; deleting
  // first risks a chapter with no script.
  if (v.previousScriptPath && v.previousScriptPath !== v.path) {
    const { error: removeError } = await client.storage
      .from("scripts")
      .remove([v.previousScriptPath]);
    if (removeError) {
      console.warn(
        `Script replaced but the previous object was not deleted (${v.previousScriptPath}): ${removeError.message}`,
      );
    }
  }

  return actionOk({ wordCount: text.trim().split(/\s+/).length });
}

const finalizeSchema = z.object({
  batchId: z.string().uuid(),
  bookId: z.string().uuid(),
  imported: z.number().int().nonnegative(),
  replaced: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

/**
 * One activity entry and one revalidation pass for the whole batch.
 *
 * Called after the last row settles, whether or not some rows failed — a batch
 * that half-succeeded still changed the book, and the screens must reflect it.
 */
export async function finalizeBulkImport(
  input: z.infer<typeof finalizeSchema>,
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid batch summary.");

  const v = parsed.data;
  const client = await serverSupabase();

  const { data: book } = await client
    .from("books")
    .select("title")
    .eq("id", v.bookId)
    .maybeSingle();

  const parts = [
    `Imported ${v.imported} ${v.imported === 1 ? "chapter" : "chapters"}`,
    book?.title ? `into ${book.title}` : null,
  ].filter(Boolean);

  const detail = [
    v.replaced > 0 ? `${v.replaced} replaced` : null,
    v.failed > 0 ? `${v.failed} failed` : null,
  ].filter(Boolean);

  await logActivity(
    client,
    actorId,
    `${parts.join(" ")}${detail.length > 0 ? ` (${detail.join(", ")})` : ""}`,
    { bookId: v.bookId },
  );

  revalidatePath(`/books/${v.bookId}`);
  revalidatePath("/books");
  // The Dashboard's Needs attention queue derives from script presence, and a
  // failed row leaves a chapter in exactly that state.
  revalidatePath("/");

  return actionOk(undefined);
}
