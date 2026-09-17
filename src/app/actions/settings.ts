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

const settingsSchema = z.object({
  storageProvider: z.string().min(1, "Choose a storage provider"),
  bucketName: z.string().trim().min(1, "Bucket name is required"),
  publicCdnDomain: z
    .string()
    .trim()
    .min(1, "Public CDN domain is required")
    .url("Enter a full URL, including https://"),
  maxAudioSizeMb: z.number().int().positive("Must be greater than zero"),
  acceptedAudioFormats: z.array(z.string()).min(1, "Keep at least one format"),
  acceptedScriptFormats: z.array(z.string()).min(1, "Keep at least one format"),
  detectDurationAutomatically: z.boolean(),
  defaultChapterAccess: z.enum(["free", "locked"]),
  freeChaptersAtStart: z.number().int().min(0, "Cannot be negative"),
  defaultMaturity: z.enum(["general", "mature_17"]),
});

export type AppSettingsInput = z.infer<typeof settingsSchema>;

export async function updateAppSettings(
  input: AppSettingsInput,
): Promise<ActionResult> {
  const actorId = await requireAdmin();

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
    }
    return actionError("Check the highlighted fields.", fields);
  }

  const client = await serverSupabase();
  const v = parsed.data;

  // Upsert rather than update: a fresh database has no settings row, because
  // prompt 12 forbids seeding one in a migration. The table's check constraint
  // pins the primary key to `true`, so this can only ever write one row.
  const { error } = await client.from("app_settings").upsert(
    {
      id: true,
      storage_provider: v.storageProvider,
      bucket_name: v.bucketName,
      public_cdn_domain: v.publicCdnDomain,
      max_audio_size_mb: v.maxAudioSizeMb,
      accepted_audio_formats: v.acceptedAudioFormats,
      accepted_script_formats: v.acceptedScriptFormats,
      detect_duration_automatically: v.detectDurationAutomatically,
      default_chapter_access: v.defaultChapterAccess,
      free_chapters_at_start: v.freeChaptersAtStart,
      default_maturity: v.defaultMaturity,
      updated_by: actorId,
    },
    { onConflict: "id" },
  );

  if (error) return actionError(describeDbError(error));

  await logActivity(client, actorId, "Settings updated");

  revalidatePath("/settings");

  return actionOk(undefined);
}

/** Every object in a bucket, walked one prefix deep per book/chapter folder. */
async function listAllObjects(
  client: Awaited<ReturnType<typeof serverSupabase>>,
  bucket: string,
): Promise<string[]> {
  const paths: string[] = [];

  const { data: top } = await client.storage.from(bucket).list("", {
    limit: 1000,
  });

  for (const entry of top ?? []) {
    // A folder has no id; a file does.
    if (entry.id) {
      paths.push(entry.name);
      continue;
    }
    const { data: nested } = await client.storage
      .from(bucket)
      .list(entry.name, { limit: 1000 });
    for (const child of nested ?? []) {
      if (child.id) {
        paths.push(`${entry.name}/${child.name}`);
        continue;
      }
      const { data: deeper } = await client.storage
        .from(bucket)
        .list(`${entry.name}/${child.name}`, { limit: 1000 });
      for (const leaf of deeper ?? []) {
        if (leaf.id) paths.push(`${entry.name}/${child.name}/${leaf.name}`);
      }
    }
  }

  return paths;
}

export async function deleteSeedData(): Promise<
  ActionResult<{ booksDeleted: number; filesDeleted: number }>
> {
  const actorId = await requireAdmin();
  const client = await serverSupabase();

  // Storage first: once the rows are gone there is nothing left pointing at the
  // objects, and orphaned media accrues storage cost indefinitely.
  let filesDeleted = 0;
  const storageFailures: string[] = [];

  for (const bucket of ["covers", "audio", "scripts"] as const) {
    const paths = await listAllObjects(client, bucket);
    if (paths.length === 0) continue;

    const { error } = await client.storage.from(bucket).remove(paths);
    if (error) {
      storageFailures.push(`${bucket}: ${error.message}`);
    } else {
      filesDeleted += paths.length;
    }
  }

  const { count, error } = await client
    .from("books")
    .delete({ count: "exact" })
    .not("id", "is", null);

  if (error) return actionError(describeDbError(error));

  // Chapters cascade from books. activity_log rows have their book/chapter
  // references nulled by ON DELETE SET NULL, so they are cleared explicitly.
  const { error: logError } = await client
    .from("activity_log")
    .delete()
    .not("id", "is", null);

  if (logError) return actionError(describeDbError(logError));

  if (storageFailures.length > 0) {
    return actionError(
      `Rows were deleted, but some files could not be removed (${storageFailures.join("; ")}). They are still using storage.`,
    );
  }

  await logActivity(client, actorId, "Seed data deleted");

  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath("/settings");

  return actionOk({ booksDeleted: count ?? 0, filesDeleted });
}
