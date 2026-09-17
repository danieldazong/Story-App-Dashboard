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

const bookInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  author: z.string().trim().min(1, "Author is required"),
  shortDescription: z.string().max(160, "Keep it under 160 characters"),
  synopsis: z.string().max(600, "Keep it under 600 characters"),
  genres: z.array(z.string()),
  maturity: z.enum(["general", "mature_17"]),
  status: z.enum(["draft", "published"]),
  defaultChapterAccess: z.enum(["free", "locked"]),
});

export type BookInput = z.infer<typeof bookInputSchema>;

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createBook(
  input: BookInput,
): Promise<ActionResult<{ id: string }>> {
  const actorId = await requireAdmin();

  const parsed = bookInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  const client = await serverSupabase();
  const values = parsed.data;

  const { data, error } = await client
    .from("books")
    .insert({
      title: values.title,
      author: values.author,
      short_description: values.shortDescription || null,
      synopsis: values.synopsis || null,
      genres: values.genres,
      maturity: values.maturity,
      status: values.status,
      default_chapter_access: values.defaultChapterAccess,
    })
    .select("id")
    .single();

  if (error) return actionError(describeDbError(error));

  await logActivity(client, actorId, `${values.title} — book created`, {
    bookId: data.id,
  });

  revalidatePath("/books");

  return actionOk({ id: data.id });
}

export async function updateBook(
  bookId: string,
  input: BookInput,
): Promise<ActionResult<{ updatedAt: string }>> {
  const actorId = await requireAdmin();

  if (!bookId) return actionError("Missing book id.");

  const parsed = bookInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Check the highlighted fields.", fieldErrorsFrom(parsed.error));
  }

  const client = await serverSupabase();
  const values = parsed.data;

  const { data, error } = await client
    .from("books")
    .update({
      title: values.title,
      author: values.author,
      short_description: values.shortDescription || null,
      synopsis: values.synopsis || null,
      genres: values.genres,
      maturity: values.maturity,
      status: values.status,
      default_chapter_access: values.defaultChapterAccess,
    })
    .eq("id", bookId)
    .select("updated_at")
    .maybeSingle();

  if (error) return actionError(describeDbError(error));

  // No row came back from an update that reported no error: RLS filtered it
  // out. That is an authorisation failure, not a no-op, and must not read as
  // success.
  if (!data) {
    return actionError(
      "That book couldn't be updated — it may have been removed, or your account lacks permission.",
    );
  }

  await logActivity(client, actorId, `${values.title} — book updated`, {
    bookId,
  });

  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);

  // Deliberately NOT revalidatePath("/"). The dashboard runs five queries
  // (3 counts + attention view + activity) and none of them are on screen
  // while editing a book. Invalidating it here made every save rebuild the
  // dashboard before the response could return. It revalidates on its own
  // navigation instead. See AGENTS.md, Performance Rules.

  return actionOk({ updatedAt: data.updated_at });
}

export async function deleteBook(bookId: string): Promise<ActionResult> {
  const actorId = await requireAdmin();

  if (!bookId) return actionError("Missing book id.");

  const client = await serverSupabase();

  // Everything needed AFTER the delete has to be read BEFORE it.
  //
  // Chapters cascade via the foreign key the instant the book row goes, so
  // their audio paths become unrecoverable — which is exactly how this used to
  // leak: the code looked for files only after the references had vanished.
  // The title is read here for the same reason, so the activity line can name
  // the book. Both reads are independent, so they share one round trip.
  const [bookRead, chapterRead] = await Promise.all([
    client.from("books").select("title, cover_path").eq("id", bookId).maybeSingle(),
    client
      .from("chapters")
      .select("audio_path")
      .eq("book_id", bookId)
      .not("audio_path", "is", null),
  ]);

  const book = bookRead.data;
  const audioPaths = (chapterRead.data ?? [])
    .map((row) => row.audio_path)
    .filter((path): path is string => path !== null);

  const { error, count } = await client
    .from("books")
    .delete({ count: "exact" })
    .eq("id", bookId);

  if (error) return actionError(describeDbError(error));
  if (!count) {
    return actionError(
      "That book couldn't be deleted — it may already be gone, or your account lacks permission.",
    );
  }

  // Row first, then objects — deliberately, and the same ordering setBookCover
  // and setChapterAudio use. Deleting files first would risk a book that still
  // exists but renders broken media; this way a storage failure can only ever
  // orphan a file, which is recoverable.
  //
  // A failed delete is logged and tolerated rather than failing the action: the
  // book IS gone, and reporting failure would tell the operator their deletion
  // did not happen when it did.
  if (book?.cover_path) {
    const { error: coverError } = await client.storage
      .from("covers")
      .remove([book.cover_path]);
    if (coverError) {
      console.warn(
        `Book deleted but its cover was not removed (${book.cover_path}): ${coverError.message}`,
      );
    }
  }

  if (audioPaths.length > 0) {
    const { error: audioError } = await client.storage
      .from("audio")
      .remove(audioPaths);
    if (audioError) {
      console.warn(
        `Book deleted but ${audioPaths.length} narration file(s) were not removed: ${audioError.message}`,
      );
    }
  }

  // No `scripts` cleanup: nothing in this codebase writes to that bucket yet
  // (script text lives on the chapter row, and `script_path` is never
  // populated). Add it here when prompt 17 starts storing source files, rather
  // than writing speculative cleanup for a path that does not exist.
  await logActivity(
    client,
    actorId,
    `${book?.title ?? "Book"} — book deleted`,
  );

  revalidatePath("/books");

  return actionOk(undefined);
}

/** Publishing defaults, for pre-filling a new book's form. */
export async function getPublishingDefaults(): Promise<
  ActionResult<{ maturity: "general" | "mature_17"; defaultChapterAccess: "free" | "locked" }>
> {
  await requireAdmin();
  const client = await serverSupabase();
  const settings = await getAppSettings(client);

  if (!settings.ok) return actionError(settings.error);

  return actionOk({
    maturity: settings.data.defaultMaturity,
    defaultChapterAccess: settings.data.defaultChapterAccess,
  });
}
