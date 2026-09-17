import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client. **Bypasses RLS entirely.**
 *
 * CONSTRAINT: import this ONLY from Server Components, Server Actions or Route
 * Handlers. Never from a Client Component — the service-role key must never
 * reach the browser, and it is deliberately not prefixed `NEXT_PUBLIC_`.
 *
 * Nothing in the read layer should need this. Every screen read runs as the
 * signed-in operator so RLS stays the enforcement boundary (AGENTS.md, Supabase
 * Rules). If you find yourself reaching for this to make a read work, the read
 * is wrong — the caller lacks a role it should have, or a policy is too narrow.
 * Fix that instead and flag it.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
