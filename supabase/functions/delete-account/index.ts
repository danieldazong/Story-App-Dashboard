// delete-account: a reader deletes their own account from the Talebrim mobile
// app (its prompt 25, M11 Profile). Google Play and Apple both require account
// deletion inside the app.
//
// Called by the app with a POST and the reader's Clerk session token as the
// bearer. Deployed with verify_jwt off (supabase/config.toml), as
// notify-new-chapters is: the platform's check is for Supabase's own tokens,
// so this function verifies the Clerk token itself: its signature against the
// Clerk instance's JWKS (RS256), its issuer and its expiry. The account is the
// token's `sub`, never anything in the body. A bad or missing token gets 401.
//
// Then, in order:
//   1. A token whose `metadata.role` is "admin" (is_admin()'s rule) gets 403
//      and nothing is deleted: admin accounts are deleted from the dashboard.
//   2. With the project's own secret key: the push_tickets of this account's
//      push tokens, then its push_tokens, reading_positions, library_items,
//      unlocks and entitlements rows. Those six tables hold everything keyed
//      to a reader. Any failure: 500, and the Clerk user is left alone.
//   3. The reader's RevenueCat customer (the mobile app's prompt 22a), so no
//      record of their purchases stays behind the account. A 404 counts as
//      done. Anything else: 502, and the reader can still retry. It doesn't
//      cancel a Google Play subscription: the app's warning says so first.
//   4. The reader's PostHog person, with their events and recordings, through
//      PostHog's bulk delete (the app identifies readers by their Clerk id).
//      PostHog deletes the events in the background. Before Clerk, so a
//      failure here (502) still leaves the reader signed in to try again.
//   5. The Clerk user, through Clerk's Backend API. A 404 counts as done, so a
//      retry after a half-way failure finishes the job. Anything else: 502.
//   6. 200 with the counts.
//
// It writes nothing the dashboard owns: books, chapters, app_settings and
// activity_log are untouched.
//
// Secrets, none of which leave this function: CLERK_SECRET_KEY and
// CLERK_ISSUER (the development instance's today; both change together at
// the production Clerk cutover); POSTHOG_PERSONAL_API_KEY (a personal API key
// that can write persons), with POSTHOG_HOST and POSTHOG_PROJECT_ID;
// REVENUECAT_SECRET_KEY and REVENUECAT_PROJECT_ID (_shared/entitlements.ts);
// and the project's own secret key (injected by Supabase). The log names
// counts only: never a token, an account id, an email or a name.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@6";

import { deleteCustomer, revenueCatApi } from "../_shared/entitlements.ts";

const CLERK_API = "https://api.clerk.com/v1";
/** A Clerk user id, as every reader table stores it. Checked before it reaches a query. */
const USER_ID = /^user_[A-Za-z0-9]+$/;
/** Clerk session tokens live 60 seconds; this allows a few seconds of clock skew, as Clerk's own SDK does. */
const CLOCK_TOLERANCE_SECONDS = 5;

/**
 * Each reader table, by its account column. push_tickets has none: it goes by
 * token, first. entitlements is the server's copy of the reader's plan
 * (prompt 22a).
 */
const READER_TABLES = ["push_tokens", "reading_positions", "library_items", "unlocks", "entitlements"] as const;

type Counts = {
  push_tickets: number;
  push_tokens: number;
  reading_positions: number;
  library_items: number;
  unlocks: number;
  entitlements: number;
  /** RevenueCat's customer: deleted now, or already gone (never made, or an earlier call). */
  revenuecat_customer: "deleted" | "already_gone";
  /** PostHog accepted the deletion: the person at once, their events in the background. */
  posthog_person: "deleted";
  /** Deleted now, or already gone by an earlier call. */
  clerk_user: "deleted" | "already_gone";
};

type RowCounts = Omit<Counts, "revenuecat_customer" | "posthog_person" | "clerk_user">;

type PostHog = { host: string; projectId: string; apiKey: string };

function respond(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

/** The project's secret key, from the runtime: sb_secret_ first, the legacy service-role key as a fallback. */
function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("no secret key in the function's environment");
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** The Clerk session token's claims once its signature, issuer and expiry check out; null otherwise. */
async function verifiedClaims(request: Request, issuer: string): Promise<JWTPayload | null> {
  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "sub"],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
    return payload;
  } catch (error) {
    // jose's error code says why ("ERR_JWT_EXPIRED"); never the token.
    console.warn("[delete-account] token refused:", (error as { code?: string }).code ?? "unknown");
    return null;
  }
}

/** is_admin()'s rule: the nested `metadata.role`, never the top-level `role`. */
function isAdmin(claims: JWTPayload): boolean {
  const metadata = claims.metadata;
  return typeof metadata === "object" && metadata !== null && (metadata as { role?: unknown }).role === "admin";
}

/** Step 2: every row keyed to the account, its plan's row included. Throws on the first failure. */
async function deleteRows(db: SupabaseClient, userId: string): Promise<RowCounts> {
  const { data: tokens, error } = await db.from("push_tokens").select("token").eq("user_id", userId);
  if (error) throw error;

  let pushTickets = 0;
  const tokenList = (tokens ?? []).map((row) => row.token as string);
  if (tokenList.length > 0) {
    const tickets = await db.from("push_tickets").delete({ count: "exact" }).in("token", tokenList);
    if (tickets.error) throw tickets.error;
    pushTickets = tickets.count ?? 0;
  }

  const counts = {
    push_tickets: pushTickets,
    push_tokens: 0,
    reading_positions: 0,
    library_items: 0,
    unlocks: 0,
    entitlements: 0,
  };
  for (const table of READER_TABLES) {
    const deleted = await db.from(table).delete({ count: "exact" }).eq("user_id", userId);
    if (deleted.error) throw deleted.error;
    counts[table] = deleted.count ?? 0;
  }
  return counts;
}

/**
 * Step 4: the reader's PostHog person, with their events and recordings, by
 * the distinct id the app identifies them with, their Clerk id. PostHog
 * answers 202 and deletes the events in the background. Null when PostHog
 * refused, or couldn't be reached.
 */
async function deletePostHogPerson(userId: string, posthog: PostHog): Promise<Counts["posthog_person"] | null> {
  try {
    const response = await fetch(
      `${posthog.host}/api/projects/${encodeURIComponent(posthog.projectId)}/persons/bulk_delete/`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${posthog.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ distinct_ids: [userId], delete_events: true, delete_recordings: true }),
      },
    );
    if (response.ok) return "deleted";
    console.error("[delete-account] PostHog answered", response.status);
    return null;
  } catch (error) {
    console.error("[delete-account] PostHog couldn't be reached:", (error as Error).name);
    return null;
  }
}

/** Step 5. Null when Clerk refused, or couldn't be reached. */
async function deleteClerkUser(userId: string, clerkSecret: string): Promise<Counts["clerk_user"] | null> {
  try {
    const response = await fetch(`${CLERK_API}/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    if (response.ok) return "deleted";
    if (response.status === 404) return "already_gone";
    console.error("[delete-account] Clerk answered", response.status);
    return null;
  } catch (error) {
    console.error("[delete-account] Clerk couldn't be reached:", (error as Error).name);
    return null;
  }
}

Deno.serve(async (request) => {
  // The web preview's browser asks first.
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const issuer = Deno.env.get("CLERK_ISSUER");
  const clerkSecret = Deno.env.get("CLERK_SECRET_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  const posthog: PostHog = {
    host: Deno.env.get("POSTHOG_HOST") ?? "",
    projectId: Deno.env.get("POSTHOG_PROJECT_ID") ?? "",
    apiKey: Deno.env.get("POSTHOG_PERSONAL_API_KEY") ?? "",
  };
  const revenueCat = revenueCatApi();
  // Every one is needed: an account deleted without its analytics or its
  // purchase record would break what the app and the deletion page promise.
  if (!issuer || !clerkSecret || !url || !posthog.host || !posthog.projectId || !posthog.apiKey || !revenueCat) {
    console.error("[delete-account] a Clerk, PostHog, RevenueCat or Supabase setting is not set");
    return respond(500, { error: "not_configured" });
  }

  const claims = await verifiedClaims(request, issuer);
  const userId = claims?.sub;
  if (!claims || typeof userId !== "string" || !USER_ID.test(userId)) return respond(401, { error: "unauthorized" });
  if (isAdmin(claims)) return respond(403, { error: "admin_account" });

  const db = createClient(url, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let rows: RowCounts;
  try {
    rows = await deleteRows(db, userId);
  } catch (error) {
    // A Postgres error code, never its message, which can quote a value.
    console.error("[delete-account] deleting rows failed:", (error as { code?: string }).code ?? "unknown");
    return respond(500, { error: "rows_failed" });
  }

  // Step 3. RevenueCat's own 404 counts as done.
  const revenuecatCustomer = await deleteCustomer(revenueCat, userId);
  if (revenuecatCustomer === null) {
    console.log("[delete-account] rows deleted, RevenueCat customer not:", JSON.stringify(rows));
    return respond(502, { error: "revenuecat_failed" });
  }

  const posthogPerson = await deletePostHogPerson(userId, posthog);
  if (posthogPerson === null) {
    console.log("[delete-account] rows and RevenueCat customer deleted, PostHog person not:", JSON.stringify(rows));
    return respond(502, { error: "posthog_failed" });
  }

  const clerkUser = await deleteClerkUser(userId, clerkSecret);
  if (clerkUser === null) {
    console.log(
      "[delete-account] rows, RevenueCat customer and PostHog person deleted, Clerk user not:",
      JSON.stringify(rows),
    );
    return respond(502, { error: "clerk_failed" });
  }

  const counts: Counts = {
    ...rows,
    revenuecat_customer: revenuecatCustomer,
    posthog_person: posthogPerson,
    clerk_user: clerkUser,
  };
  console.log("[delete-account]", JSON.stringify(counts));
  return respond(200, counts);
});
