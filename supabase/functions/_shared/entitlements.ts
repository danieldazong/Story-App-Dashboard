// The entitlement mirror's one module (the mobile app's prompt 22a), shared by
// revenuecat-webhook, sync-entitlement and delete-account.
//
// RevenueCat is the truth. syncCustomer() asks RevenueCat's REST API (v2) for
// a reader's active entitlements, then writes public.entitlements to match: a
// row while Talebrim Unlimited is active, none otherwise. Nothing the phone or
// a webhook says about a plan is ever written, so a duplicate, late or forged
// event can only make the server ask RevenueCat again.
//
// Settings, none of which leave the functions:
//   REVENUECAT_SECRET_KEY  a v2 secret key with Customer information: read &
//                          write, and nothing else
//   REVENUECAT_PROJECT_ID  the project's id, as RevenueCat's dashboard
//                          address shows it (ce9557c5)
//   REVENUECAT_ENTITLEMENT_ID  ad_free's internal id. v2 lists a customer's
//                          active entitlements by it, and the key may not read
//                          the project's configuration to look it up.
// The log never holds a key, an account id or a payload.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.revenuecat.com";
/**
 * The app's entitlement identifier (`ENTITLEMENT_ID` in the mobile app's
 * `lib/revenuecat.ts`), and its lookup key in RevenueCat: what a row is filed
 * under, and what has_active_plan() asks for. Change all three together.
 */
export const ENTITLEMENT = "ad_free";
/**
 * A Clerk user id: the reader's RevenueCat App User ID (the app logs in with
 * it). Anything else, such as an anonymous `$RCAnonymousID:…`, is never synced.
 */
const CLERK_USER_ID = /^user_[A-Za-z0-9]+$/;
/** How many pages of a customer's subscriptions to read for a plan's details, 100 a page. */
const MAX_SUBSCRIPTION_PAGES = 5;

/** What reading and deleting customers needs. */
export type RevenueCatApi = { secretKey: string; projectId: string };
/** What a sync needs. */
export type RevenueCat = RevenueCatApi & { entitlementId: string };

/** What a sync found: RevenueCat's answer, as the row now holds it. */
export type Sync = { active: boolean; expiresAt: string | null };

/** RevenueCat answered with something other than what was asked for: the caller answers 5xx. */
export class RevenueCatError extends Error {
  constructor(readonly status: number) {
    super(`RevenueCat answered ${status}`);
  }
}

export function isClerkUserId(value: unknown): value is string {
  return typeof value === "string" && CLERK_USER_ID.test(value);
}

/** The API settings, or null when either is missing. */
export function revenueCatApi(): RevenueCatApi | null {
  const secretKey = Deno.env.get("REVENUECAT_SECRET_KEY");
  const projectId = Deno.env.get("REVENUECAT_PROJECT_ID");
  return secretKey && projectId ? { secretKey, projectId } : null;
}

/** Every setting a sync needs, or null when one is missing. */
export function revenueCat(): RevenueCat | null {
  const api = revenueCatApi();
  const entitlementId = Deno.env.get("REVENUECAT_ENTITLEMENT_ID");
  return api && entitlementId ? { ...api, entitlementId } : null;
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

/** The database the mirror is written to, with the project's secret key; null without its address. */
export function mirrorDatabase(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return null;
  return createClient(url, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function customerUrl(api: RevenueCatApi, userId: string): string {
  return `${API}/v2/projects/${encodeURIComponent(api.projectId)}/customers/${encodeURIComponent(userId)}`;
}

/** A GET to RevenueCat: 404 as null, any other failure thrown. */
async function read<T>(api: RevenueCatApi, url: string): Promise<T | null> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${api.secretKey}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new RevenueCatError(response.status);
  return (await response.json()) as T;
}

type List<T> = { items?: T[]; next_page?: string | null };

/**
 * A list's next page, which RevenueCat gives as a path ("/v2/projects/…") or a
 * full address. Only ever RevenueCat's own: the secret key goes with it.
 */
function nextPageUrl(next: string | null): string | null {
  if (next === null || next === "") return null;
  if (next.startsWith(`${API}/`)) return next;
  if (/^[a-z]+:/i.test(next)) return null;
  return `${API}${next.startsWith("/v2/") ? "" : "/v2"}${next.startsWith("/") ? "" : "/"}${next}`;
}
type ActiveEntitlement = { entitlement_id?: string; expires_at?: number | null };
type Subscription = {
  gives_access?: boolean;
  product_id?: string | null;
  store?: string | null;
  environment?: string | null;
  current_period_ends_at?: number | null;
  entitlements?: List<{ id?: string; lookup_key?: string }>;
};

/**
 * The reader's Talebrim Unlimited, as RevenueCat reports it now: null when
 * it isn't active, or RevenueCat has never seen the reader (a 404: reading
 * never creates a customer). Through a billing grace period it stays active,
 * its expiry the grace period's end.
 */
async function activeEntitlement(rc: RevenueCat, userId: string): Promise<{ expiresAt: string | null } | null> {
  const list = await read<List<ActiveEntitlement>>(rc, `${customerUrl(rc, userId)}/active_entitlements?limit=100`);
  const item = list?.items?.find((entry) => entry.entitlement_id === rc.entitlementId);
  if (!item) return null;
  return { expiresAt: typeof item.expires_at === "number" ? new Date(item.expires_at).toISOString() : null };
}

/**
 * The subscription that gives the access, for the row's details: the one
 * whose period ends last. Null for a plan no subscription backs (a
 * promotional grant).
 */
async function planDetails(
  rc: RevenueCat,
  userId: string,
): Promise<Pick<Subscription, "product_id" | "store" | "environment"> | null> {
  let url: string | null = `${customerUrl(rc, userId)}/subscriptions?limit=100`;
  let best: Subscription | null = null;
  for (let page = 0; url !== null && page < MAX_SUBSCRIPTION_PAGES; page += 1) {
    const list: List<Subscription> | null = await read<List<Subscription>>(rc, url);
    for (const subscription of list?.items ?? []) {
      const opens = subscription.entitlements?.items?.some(
        (entitlement) => entitlement.id === rc.entitlementId || entitlement.lookup_key === ENTITLEMENT,
      );
      if (subscription.gives_access !== true || !opens) continue;
      const ends = subscription.current_period_ends_at ?? Number.POSITIVE_INFINITY;
      if (best === null || ends > (best.current_period_ends_at ?? Number.POSITIVE_INFINITY)) best = subscription;
    }
    url = nextPageUrl(list?.next_page ?? null);
  }
  return best;
}

/**
 * Asks RevenueCat for the reader's plan and writes the mirror to match:
 * upserts their row while Talebrim Unlimited is active, deletes it otherwise.
 * Throws when RevenueCat or the database fails, so a webhook is retried.
 */
export async function syncCustomer(db: SupabaseClient, rc: RevenueCat, userId: string): Promise<Sync> {
  if (!isClerkUserId(userId)) throw new Error("not a Clerk user id");

  const active = await activeEntitlement(rc, userId);
  if (active === null) {
    const { error } = await db.from("entitlements").delete().eq("user_id", userId).eq("entitlement", ENTITLEMENT);
    if (error) throw error;
    return { active: false, expiresAt: null };
  }

  const details = await planDetails(rc, userId);
  const { error } = await db.from("entitlements").upsert(
    {
      user_id: userId,
      entitlement: ENTITLEMENT,
      expires_at: active.expiresAt,
      product_id: details?.product_id ?? null,
      store: details?.store ?? null,
      environment: details?.environment ?? null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,entitlement" },
  );
  if (error) throw error;
  return { active: true, expiresAt: active.expiresAt };
}

/**
 * Deletes the reader's RevenueCat customer (account deletion). "already_gone"
 * when RevenueCat has none, so a retry finishes the job; null when RevenueCat
 * refused, or couldn't be reached. It doesn't cancel a store subscription.
 */
export async function deleteCustomer(api: RevenueCatApi, userId: string): Promise<"deleted" | "already_gone" | null> {
  try {
    const response = await fetch(customerUrl(api, userId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${api.secretKey}` },
    });
    if (response.ok) return "deleted";
    if (response.status === 404) return "already_gone";
    console.error("[entitlements] RevenueCat answered", response.status, "to a deletion");
    return null;
  } catch (error) {
    console.error("[entitlements] RevenueCat couldn't be reached:", (error as Error).name);
    return null;
  }
}

/** Why a sync failed, for the log: a status or an error code, never a value. */
export function describeFailure(error: unknown): string {
  if (error instanceof RevenueCatError) return `revenuecat ${error.status}`;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.length > 0) return `database ${code}`;
  return (error as Error)?.name ?? "unknown";
}
