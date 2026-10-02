// revenuecat-webhook: RevenueCat's webhook, for the entitlement mirror (the
// mobile app's prompt 22a). It keeps public.entitlements true while the app
// is closed: renewals, cancellations, expiries, refunds and transfers.
//
// Called by RevenueCat with a POST, every event type, from production and
// sandbox (the Test Store's purchases included: their `store` is
// TEST_STORE). Deployed with verify_jwt off (supabase/config.toml), as
// notify-new-chapters is: the caller isn't a user. The request's
// Authorization header must equal REVENUECAT_WEBHOOK_AUTH, compared in
// constant time; anything else gets 401. RevenueCat sends the value exactly as
// it was entered in its dashboard.
//
// Each event:
//   - TEST (RevenueCat's "send test event") answers 200 and changes nothing.
//   - Any other type syncs every Clerk-shaped id it names: app_user_id,
//     original_app_user_id and aliases, and for a TRANSFER (which has no
//     app_user_id) transferred_from and transferred_to. Anonymous ids are
//     skipped. The event's own fields are never trusted: each sync reads the
//     customer's active entitlements from RevenueCat
//     (_shared/entitlements.ts), so duplicate or out-of-order deliveries are
//     harmless.
//   - A failure to reach RevenueCat or the database answers 500, so
//     RevenueCat retries (5 times, 5 to 80 minutes apart). RevenueCat waits
//     60 seconds for an answer; a sync takes about a second.
//
// Secrets, none of which leave this function: REVENUECAT_WEBHOOK_AUTH, the
// three REVENUECAT_ settings (_shared/entitlements.ts) and the project's own
// secret key (injected by Supabase). The log names event types, counts and
// error codes only: never an id, a key or the payload.

import {
  describeFailure,
  isClerkUserId,
  mirrorDatabase,
  revenueCat,
  syncCustomer,
} from "../_shared/entitlements.ts";

/** The event fields that name customers: one id each, or a list. */
const ID_FIELDS = ["app_user_id", "original_app_user_id"] as const;
const ID_LIST_FIELDS = ["aliases", "transferred_from", "transferred_to"] as const;

function respond(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

/** Compares the Authorization value in constant time, so its length and prefix can't be probed. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** Every distinct Clerk user id the event names. */
function customerIds(event: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const field of ID_FIELDS) {
    const id = event[field];
    if (isClerkUserId(id)) ids.add(id);
  }
  for (const field of ID_LIST_FIELDS) {
    const list = event[field];
    if (!Array.isArray(list)) continue;
    for (const id of list) if (isClerkUserId(id)) ids.add(id);
  }
  return [...ids];
}

Deno.serve(async (request) => {
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  if (!expected) {
    console.error("[revenuecat-webhook] REVENUECAT_WEBHOOK_AUTH is not set");
    return respond(500, { error: "not_configured" });
  }
  const given = request.headers.get("authorization");
  if (!given || !sameSecret(given, expected)) return respond(401, { error: "unauthorized" });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  let event: Record<string, unknown>;
  try {
    const body = (await request.json()) as { event?: unknown };
    if (typeof body?.event !== "object" || body.event === null) return respond(400, { error: "bad_request" });
    event = body.event as Record<string, unknown>;
  } catch {
    return respond(400, { error: "bad_request" });
  }
  const type = typeof event.type === "string" ? event.type : "UNKNOWN";

  // Before the settings: a test event needs none of them.
  if (type === "TEST") {
    console.log("[revenuecat-webhook] TEST event: nothing to sync");
    return respond(200, { type, synced: 0 });
  }

  const rc = revenueCat();
  const db = mirrorDatabase();
  if (!rc || !db) {
    // 500, so RevenueCat retries once the settings are in.
    console.error("[revenuecat-webhook] a RevenueCat or Supabase setting is not set");
    return respond(500, { error: "not_configured" });
  }

  const ids = customerIds(event);
  let active = 0;
  try {
    for (const id of ids) {
      if ((await syncCustomer(db, rc, id)).active) active += 1;
    }
  } catch (error) {
    console.error("[revenuecat-webhook]", type, "sync failed:", describeFailure(error));
    return respond(500, { error: "sync_failed" });
  }

  console.log("[revenuecat-webhook]", JSON.stringify({ type, customers: ids.length, active }));
  return respond(200, { type, synced: ids.length });
});
