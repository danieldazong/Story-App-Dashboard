import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Builds a Supabase client authenticated as the current Clerk user.
 *
 * `getToken` comes from `auth()` in Server Components and Server Actions, or
 * from `useAuth()` in Client Components. Every request carries the Clerk
 * session token, so RLS sees the real caller — `auth.jwt() ->> 'sub'` is the
 * Clerk user id and `is_admin()` reads `metadata.role` from the same token.
 *
 * Do NOT replace this with the deprecated integration that injects a Clerk
 * JWT-template token into a global Authorization header. Supabase deprecated
 * that on 1 April 2025: it requires sharing the project JWT secret with a third
 * party, rotating that secret causes downtime, and minting a separate JWT adds
 * latency over using the session token directly. See AGENTS.md, Supabase Rules.
 */
export function createSupabaseClient(
  getToken: () => Promise<string | null>,
): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await getToken()) ?? null },
  );
}
