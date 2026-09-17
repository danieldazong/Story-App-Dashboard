import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseClient } from "@/lib/supabase";
import { getAppSettings, type AppSettings } from "@/lib/queries";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for the signed-in operator.
 *
 * Reads run as the caller so RLS stays the enforcement boundary — never the
 * service-role client (see lib/supabase-admin.ts for why).
 *
 * Wrapped in React's cache() so one request reuses one client. Previously every
 * call built a fresh client: a single page render made several, each opening its
 * own connection and registering its own stream listeners — which is what
 * produced the recurring `MaxListenersExceededWarning: 11 drain listeners added
 * to [Gzip]` in the dev log. Deduping is per-request, so a client is never
 * shared between users and the auth boundary is unchanged.
 */
export const serverSupabase = cache(async function serverSupabase(): Promise<
  SupabaseClient<Database>
> {
  const { getToken } = await auth();
  return createSupabaseClient(getToken);
});

/**
 * Client plus settings in one call. Almost every screen needs the CDN domain
 * from `app_settings` before it can turn storage paths into media URLs, so
 * fetching them separately would mean two round trips on every page.
 */
export async function serverSupabaseWithSettings(): Promise<{
  client: SupabaseClient<Database>;
  settings: AppSettings;
  settingsError: string | null;
}> {
  const client = await serverSupabase();
  const result = await getAppSettings(client);

  if (!result.ok) {
    // Settings failing should not blank out a catalog screen, so the caller
    // gets the error to surface and a usable client either way.
    const fallback = await getAppSettings(client);
    return {
      client,
      settings: fallback.ok
        ? fallback.data
        : {
            storageProvider: "supabase_storage",
            bucketName: "novelnow-media",
            publicCdnDomain: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
            maxAudioSizeMb: 100,
            acceptedAudioFormats: [".m4a", ".mp3", ".wav"],
            acceptedScriptFormats: [".txt", ".docx", ".md"],
            detectDurationAutomatically: true,
            defaultChapterAccess: "locked",
            freeChaptersAtStart: 3,
            defaultMaturity: "mature_17",
          },
      settingsError: result.error,
    };
  }

  return { client, settings: result.data, settingsError: null };
}
