// sync-entitlement: the mobile app asks the server to check the reader's own
// plan with RevenueCat, for the entitlement mirror (its prompt 22a). It runs
// after a purchase or restore, so the chapter just bought opens at once
// rather than when RevenueCat's webhook arrives, and catches a renewal whose
// webhook was missed.
//
// Called by the app with a POST and the reader's Clerk session token as the
// bearer. Deployed with verify_jwt off (supabase/config.toml), as
// delete-account is: the token is Clerk's, so the function verifies it itself
// (the instance's JWKS, RS256, its issuer and its expiry). It syncs the
// token's `sub` and nobody else: nothing in the body is read.
//
// It answers { active, expires_at } with what RevenueCat said
// (_shared/entitlements.ts), never what the app claims. A row synced in the
// last 10 seconds answers from the table without asking RevenueCat, and so
// does a reader with no row this instance asked for in the last 10 seconds,
// so no reader can spend the project's RevenueCat rate limit. A failure to
// reach RevenueCat answers 502; the database, 500. The app treats both as
// "not checked" and decides nothing from them.
//
// Secrets, none of which leave this function: CLERK_ISSUER (shared with
// delete-account and contact-support; it changes at the production Clerk
// cutover), the three REVENUECAT_ settings and the project's own secret key.
// The log names outcomes and codes only: never a token or an account id.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@6";

import {
  ENTITLEMENT,
  RevenueCatError,
  describeFailure,
  isClerkUserId,
  mirrorDatabase,
  revenueCat,
  syncCustomer,
} from "../_shared/entitlements.ts";

/** Clerk session tokens live 60 seconds; this allows a few seconds of clock skew, as Clerk's own SDK does. */
const CLOCK_TOLERANCE_SECONDS = 5;
/** How long a sync answers for itself before RevenueCat is asked again. */
const SYNC_INTERVAL_MS = 10_000;

/**
 * Readers this instance asked RevenueCat about lately: the throttle for a
 * reader with no row to time from (no plan). Per instance, so it only blunts
 * a loop; the row's synced_at is the throttle that holds everywhere.
 */
const recentlyAsked = new Map<string, number>();

function respond(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: corsHeaders });
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
    console.warn("[sync-entitlement] token refused:", (error as { code?: string }).code ?? "unknown");
    return null;
  }
}

/** Whether a row's plan is running now, by the server's clock: has_active_plan()'s rule. */
function runningNow(expiresAt: string | null, now: number): boolean {
  return expiresAt === null || Date.parse(expiresAt) > now;
}

/** Notes that RevenueCat was asked about `userId`, dropping entries old enough not to matter. */
function remember(userId: string, now: number) {
  recentlyAsked.set(userId, now);
  if (recentlyAsked.size <= 1_000) return;
  for (const [id, at] of recentlyAsked) if (now - at >= SYNC_INTERVAL_MS) recentlyAsked.delete(id);
}

Deno.serve(async (request) => {
  // The web preview's browser asks first.
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const issuer = Deno.env.get("CLERK_ISSUER");
  const rc = revenueCat();
  const db = mirrorDatabase();
  if (!issuer || !rc || !db) {
    console.error("[sync-entitlement] a Clerk, RevenueCat or Supabase setting is not set");
    return respond(500, { error: "not_configured" });
  }

  const userId = (await verifiedClaims(request, issuer))?.sub;
  if (!isClerkUserId(userId)) return respond(401, { error: "unauthorized" });

  const now = Date.now();
  const { data: row, error } = await db
    .from("entitlements")
    .select("expires_at, synced_at")
    .eq("user_id", userId)
    .eq("entitlement", ENTITLEMENT)
    .maybeSingle();
  if (error) {
    console.error("[sync-entitlement] reading the row failed:", describeFailure(error));
    return respond(500, { error: "database_failed" });
  }
  if (row !== null && now - Date.parse(row.synced_at as string) < SYNC_INTERVAL_MS) {
    const expiresAt = row.expires_at as string | null;
    return respond(200, { active: runningNow(expiresAt, now), expires_at: expiresAt });
  }
  if (row === null && now - (recentlyAsked.get(userId) ?? 0) < SYNC_INTERVAL_MS) {
    return respond(200, { active: false, expires_at: null });
  }

  remember(userId, now);
  try {
    const synced = await syncCustomer(db, rc, userId);
    console.log("[sync-entitlement] synced:", synced.active ? "active" : "none");
    return respond(200, { active: synced.active, expires_at: synced.expiresAt });
  } catch (failure) {
    console.error("[sync-entitlement] sync failed:", describeFailure(failure));
    // RevenueCat refused or couldn't be reached: 502. The database: 500.
    const fromDatabase = !(failure instanceof RevenueCatError) && typeof (failure as { code?: unknown }).code === "string";
    return respond(fromDatabase ? 500 : 502, { error: "sync_failed" });
  }
});
