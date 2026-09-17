import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseClient } from "@/lib/supabase";
import {
  getAppSettings,
  settingsFallback,
  type AppSettings,
} from "@/lib/queries";
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
    //
    // This used to re-run getAppSettings() here — the identical query, on the
    // same client, in the same tick — and call the result a "fallback". It was
    // neither a retry (no delay, so the same failure simply recurred) nor a
    // fallback, and it doubled the round trips on the failure path. Real,
    // network-gated retry now lives inside getAppSettings itself.
    //
    // The defaults come from settingsFallback() rather than a second inline
    // copy: the old literal here had already drifted from it, defaulting the
    // CDN domain to "" where settingsFallback() uses SETTINGS_DEFAULTS.
    return {
      client,
      settings: settingsFallback(),
      settingsError: result.error,
    };
  }

  return { client, settings: result.data, settingsError: null };
}
