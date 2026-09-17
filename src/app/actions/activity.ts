import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Records what happened, in the voice already used on the Dashboard's activity
 * card: past tense, specific, no ceremony.
 *
 * Log the mutation, not the intent — this is only ever called after a write has
 * actually succeeded. A failed mutation writes nothing, so the log never claims
 * something happened that didn't.
 *
 * A failure to log is deliberately swallowed: losing an activity row is not a
 * reason to fail an operation the operator already completed successfully.
 */
export async function logActivity(
  client: SupabaseClient<Database>,
  actorId: string,
  message: string,
  refs?: { bookId?: string; chapterId?: string },
): Promise<void> {
  await client.from("activity_log").insert({
    actor_id: actorId,
    message,
    book_id: refs?.bookId ?? null,
    chapter_id: refs?.chapterId ?? null,
  });
}
