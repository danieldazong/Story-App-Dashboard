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
import type { Database } from "@/types/database";

const createChapterSchema = z.object({
  bookId: z.string().min(1, "Missing book id"),
  number: z.number().int().min(1, "Chapter number must be at least 1"),
  title: z.string().trim(),
  access: z.enum(["free", "locked"]).optional(),
  scriptText: z.string().optional(),
  scriptFileName: z.string().nullable().optional(),
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>;

const updateChapterSchema = z.object({
  chapterId: z.string().min(1, "Missing chapter id"),
  bookId: z.string().min(1, "Missing book id"),
  number: z.number().int().min(1, "Chapter number must be at least 1"),
  title: z.string().trim().min(1, "Title is required"),
  access: z.enum(["free", "locked"]),
  scriptText: z.string().optional(),
  scriptFileName: z.string().nullable().optional(),
  audioDurationSeconds: z.number().int().min(0).optional(),
  audioDurationSource: z.enum(["detected", "manual"]).optional(),
});

export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;

const padded = (n: number) => String(n).padStart(2, "0");

/**
 * Turns a (book_id, number) unique-constraint violation into a field error
 * naming the conflict, rather than surfacing a Postgres error string.
 */
async function numberConflictError(
  client: Awaited<ReturnType<typeof serverSupabase>>,
  bookId: string,
  number: number,
): Promise<ActionResult<never>> {
  const { data } = await client
    .from("chapters")
    .select("title")
    .eq("book_id", bookId)
    .eq("number", number)
    .maybeSingle();

  return actionError("Check the highlighted fields.", {
    number: data?.title
      ? `Chapter ${padded(number)} already exists — "${data.title}".`
      : `Chapter ${padded(number)} already exists.`,
  });
}

export async function createChapter(
  input: CreateChapterInput,
): Promise<ActionResult<{ id: string; number: number }>> {
  const actorId = await requireAdmin();

  const parsed = createChapterSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid chapter.");
  }

  const client = await serverSupabase();
  const values = parsed.data;

  // Access falls back to the book's own default, then to app_settings — a
  // per-serial paywall shape overrides the global one.
  let access = values.access;
  if (!access) {
    const { data: book } = await client
      .from("books")
      .select("default_chapter_access")
      .eq("id", values.bookId)
      .maybeSingle();

    if (book) {
      access = book.default_chapter_access;
    } else {
      const settings = await getAppSettings(client);
      access = settings.ok ? settings.data.defaultChapterAccess : "locked";
    }
  }

  const scriptText = values.scriptText?.trim() ?? "";

  const { data, error } = await client
    .from("chapters")
    .insert({
      book_id: values.bookId,
      number: values.number,
      title: values.title || `Chapter ${padded(values.number)}`,
      access,
      script_text: scriptText === "" ? null : scriptText,
      script_file_name: scriptText === "" ? null : values.scriptFileName ?? null,
    })
    .select("id, number, title")
    .single();

  if (error) {
    if (error.code === "23505") {
      return numberConflictError(client, values.bookId, values.number);
    }
    return actionError(describeDbError(error));
  }

  await logActivity(
    client,
    actorId,
    `Chapter ${padded(data.number)} created — ${data.title}`,
    { bookId: values.bookId, chapterId: data.id },
  );

  revalidatePath(`/books/${values.bookId}`);
  revalidatePath("/books");

  // Not revalidatePath("/") — the dashboard's five queries are not on screen
  // here and rebuilding them delayed this response. See AGENTS.md,
  // Performance Rules.

  return actionOk({ id: data.id, number: data.number });
}

export async function updateChapter(
  input: UpdateChapterInput,
): Promise<ActionResult<{ updatedAt: string; number: number }>> {
  const actorId = await requireAdmin();

  const parsed = updateChapterSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
    return actionError(
      "Check the highlighted fields.",
      key ? { [key]: issue.message } : undefined,
    );
  }

  const client = await serverSupabase();
  const values = parsed.data;
  const scriptText = values.scriptText?.trim() ?? "";

  const update: Database["public"]["Tables"]["chapters"]["Update"] = {
    number: values.number,
    title: values.title,
    access: values.access,
    script_text: scriptText === "" ? null : scriptText,
    script_file_name: scriptText === "" ? null : values.scriptFileName ?? null,
  };

  // Duration is the manual fallback for detection reporting Infinity/NaN, so it
  // persists independently of any upload path.
  if (values.audioDurationSeconds !== undefined) {
    update.audio_duration_seconds = values.audioDurationSeconds;
    update.audio_duration_source = values.audioDurationSource ?? "manual";
  }

  const { data, error } = await client
    .from("chapters")
    .update(update)
    .eq("id", values.chapterId)
    .select("updated_at, number, title")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return numberConflictError(client, values.bookId, values.number);
    }
    return actionError(describeDbError(error));
  }

  if (!data) {
    return actionError(
      "That chapter couldn't be saved — it may have been removed, or your account lacks permission.",
    );
  }

  await logActivity(
    client,
    actorId,
    `Chapter ${padded(data.number)} updated — ${data.title}`,
    { bookId: values.bookId, chapterId: values.chapterId },
  );

  revalidatePath(`/books/${values.bookId}/chapters/${values.number}`);
  revalidatePath(`/books/${values.bookId}`);
  revalidatePath("/books");

  return actionOk({ updatedAt: data.updated_at, number: data.number });
}

export async function updateChapterAccess(
  chapterId: string,
  bookId: string,
  access: "free" | "locked",
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  const parsed = z
    .object({
      chapterId: z.string().min(1),
      bookId: z.string().min(1),
      access: z.enum(["free", "locked"]),
    })
    .safeParse({ chapterId, bookId, access });

  if (!parsed.success) return actionError("Invalid chapter.");

  const client = await serverSupabase();

  const { data, error } = await client
    .from("chapters")
    .update({ access: parsed.data.access })
    .eq("id", parsed.data.chapterId)
    .select("number, title")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));
  if (!data) {
    return actionError(
      "That chapter couldn't be changed — it may have been removed, or your account lacks permission.",
    );
  }

  await logActivity(
    client,
    actorId,
    `Chapter ${padded(data.number)} set ${parsed.data.access}`,
    { bookId: parsed.data.bookId, chapterId: parsed.data.chapterId },
  );

  revalidatePath(`/books/${parsed.data.bookId}`);
  revalidatePath(`/books/${parsed.data.bookId}/chapters/${data.number}`);
  revalidatePath("/books");

  return actionOk(undefined);
}

export async function deleteChapter(
  chapterId: string,
  bookId: string,
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  if (!chapterId || !bookId) return actionError("Missing chapter id.");

  const client = await serverSupabase();

  const { data: chapter } = await client
    .from("chapters")
    .select("number, title")
    .eq("id", chapterId)
    .maybeSingle();

  const { error, count } = await client
    .from("chapters")
    .delete({ count: "exact" })
    .eq("id", chapterId);

  if (error) return actionError(describeDbError(error));
  if (!count) {
    return actionError(
      "That chapter couldn't be deleted — it may already be gone, or your account lacks permission.",
    );
  }

  await logActivity(
    client,
    actorId,
    chapter
      ? `Chapter ${padded(chapter.number)} deleted — ${chapter.title}`
      : "Chapter deleted",
    { bookId },
  );

  revalidatePath(`/books/${bookId}`);
  revalidatePath("/books");

  return actionOk(undefined);
}
