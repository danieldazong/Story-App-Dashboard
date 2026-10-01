// contact-support: a reader's message from the Talebrim mobile app's Help
// form (M11, the owner's request on 2026-10-01), emailed to the support inbox
// (SUPPORT_EMAIL_TO: support@nouvrix.com, the parent company's, since
// 2026-10-01) through Resend, with the reader's address to reply to.
//
// Called by the app with a POST, the reader's Clerk session token as the
// bearer, and { topic, message, context }. Deployed with verify_jwt off, as
// delete-account is: the token is Clerk's, so the function verifies it itself
// (the instance's JWKS, RS256, its issuer and its expiry). The account is the
// token's `sub`. The reply-to address is the account's own primary email,
// read from Clerk's Backend API: never anything in the body.
//
// In order:
//   1. The body: a known topic, a message of 1 to 4000 characters, and short
//      context strings (the app's version, the platform and its version, the
//      phone's model). 400 otherwise.
//   2. The account, from Clerk: its primary email, its name, and when it last
//      sent messages (its private metadata, which only the server can see).
//      More than 5 in the last hour: 429, with Retry-After.
//   3. The email, through Resend: to SUPPORT_EMAIL_TO, from
//      SUPPORT_EMAIL_FROM (an address on the domain verified in Resend),
//      replying to the reader. HTML in Talebrim's colours, with a plain-text
//      twin; the reader's words are escaped. Anything but 2xx: 502.
//   4. The send's time joins the account's recent sends (private metadata,
//      which Clerk deep-merges). A failure there is logged, not returned:
//      the message went.
//   5. 200.
//
// It stores nothing in the database and writes nothing the dashboard owns.
// The app (`lib/support.ts`) keeps its own copy of the topics and the length
// limit: change both together.
//
// Secrets, none of which leave this function: CLERK_SECRET_KEY and
// CLERK_ISSUER (shared with delete-account; both change together at the
// production Clerk cutover), RESEND_API_KEY, SUPPORT_EMAIL_TO and
// SUPPORT_EMAIL_FROM. Until a sending domain is verified in Resend, the
// sender is Resend's own onboarding@resend.dev, which delivers only to the
// address the Resend account signed up with: so that is support@nouvrix.com.
// Once the domain is verified, SUPPORT_EMAIL_FROM moves to an address on it;
// no code changes. The log holds outcomes and codes only: never the message, an
// address, a name or a token.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "npm:jose@6";

import { buildEmail } from "./email.ts";

const CLERK_API = "https://api.clerk.com/v1";
const RESEND_API = "https://api.resend.com/emails";
/** A Clerk user id. Checked before it reaches a URL. */
const USER_ID = /^user_[A-Za-z0-9]+$/;
/** Clerk session tokens live 60 seconds; this allows a few seconds of clock skew, as Clerk's own SDK does. */
const CLOCK_TOLERANCE_SECONDS = 5;

/** The app's topics (`lib/support.ts`), with the words the email uses. */
const TOPICS: Record<string, string> = {
  account: "Account",
  reading: "Reading & listening",
  downloads: "Downloads",
  subscription: "Subscription",
  other: "Something else",
};
const MESSAGE_MAX = 4000;
/** Each context string, at most. */
const CONTEXT_MAX = 60;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60_000;

type Context = {
  appVersion: string | null;
  appBuild: string | null;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
};

type Account = {
  email: string | null;
  name: string | null;
  /** When it sent messages recently, in ms. */
  recentSends: number[];
};

function respond(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...corsHeaders, ...headers } });
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
    console.warn("[contact-support] token refused:", (error as { code?: string }).code ?? "unknown");
    return null;
  }
}

/** A short, single-line string from the app, or null. */
function contextText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Control characters never belong in the email's footer.
  // deno-lint-ignore no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, CONTEXT_MAX) : null;
}

/** Step 1. Null for a body the app would never send. */
function parseBody(body: unknown): { topic: string; message: string; context: Context } | null {
  if (typeof body !== "object" || body === null) return null;
  const { topic, message, context } = body as { topic?: unknown; message?: unknown; context?: unknown };
  if (typeof topic !== "string" || !(topic in TOPICS)) return null;
  if (typeof message !== "string") return null;
  const text = message.trim();
  if (text.length === 0 || text.length > MESSAGE_MAX) return null;
  const raw = (typeof context === "object" && context !== null ? context : {}) as Record<string, unknown>;
  return {
    topic,
    message: text,
    context: {
      appVersion: contextText(raw.appVersion),
      appBuild: contextText(raw.appBuild),
      platform: contextText(raw.platform),
      osVersion: contextText(raw.osVersion),
      deviceModel: contextText(raw.deviceModel),
    },
  };
}

/** Step 2. Null when Clerk couldn't be reached or refused. */
async function readAccount(userId: string, clerkSecret: string): Promise<Account | null> {
  try {
    const response = await fetch(`${CLERK_API}/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    if (!response.ok) {
      console.error("[contact-support] Clerk answered", response.status);
      return null;
    }
    const user = (await response.json()) as {
      first_name?: string | null;
      last_name?: string | null;
      primary_email_address_id?: string | null;
      email_addresses?: { id: string; email_address: string }[];
      private_metadata?: { support?: { sent?: unknown } } | null;
    };
    const email =
      user.email_addresses?.find((address) => address.id === user.primary_email_address_id)?.email_address ?? null;
    const name = [user.first_name, user.last_name].filter((part) => part?.trim()).join(" ") || null;
    const sent = user.private_metadata?.support?.sent;
    const recentSends = Array.isArray(sent) ? sent.filter((time): time is number => typeof time === "number") : [];
    return { email, name, recentSends };
  } catch (error) {
    console.error("[contact-support] Clerk couldn't be reached:", (error as Error).name);
    return null;
  }
}

Deno.serve(async (request) => {
  // The web preview's browser asks first.
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });

  const issuer = Deno.env.get("CLERK_ISSUER");
  const clerkSecret = Deno.env.get("CLERK_SECRET_KEY");
  if (!issuer || !clerkSecret) {
    console.error("[contact-support] CLERK_ISSUER or CLERK_SECRET_KEY is not set");
    return respond(500, { error: "not_configured" });
  }

  const claims = await verifiedClaims(request, issuer);
  const userId = claims?.sub;
  if (!claims || typeof userId !== "string" || !USER_ID.test(userId)) return respond(401, { error: "unauthorized" });

  const body = parseBody(await request.json().catch(() => null));
  if (body === null) return respond(400, { error: "invalid_message" });

  const account = await readAccount(userId, clerkSecret);
  if (account === null) return respond(502, { error: "account_unavailable" });

  const now = Date.now();
  const recent = account.recentSends.filter((time) => now - time < RATE_WINDOW_MS).sort((a, b) => a - b);
  if (recent.length >= RATE_LIMIT) {
    const retryAfter = Math.ceil((recent[0] + RATE_WINDOW_MS - now) / 1000);
    console.log("[contact-support] rate limited");
    return respond(429, { error: "rate_limited", retry_after: retryAfter }, { "Retry-After": String(retryAfter) });
  }

  // Checked here, not first: everything before it still answers while the
  // email side is being set up.
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("SUPPORT_EMAIL_TO");
  const from = Deno.env.get("SUPPORT_EMAIL_FROM");
  if (!resendKey || !to || !from) {
    console.error("[contact-support] RESEND_API_KEY, SUPPORT_EMAIL_TO or SUPPORT_EMAIL_FROM is not set");
    return respond(500, { error: "not_configured" });
  }

  const email = buildEmail({
    userId,
    sender: { name: account.name, email: account.email },
    topic: TOPICS[body.topic],
    message: body.message,
    device: body.context,
  });
  try {
    const response = await fetch(RESEND_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        ...(account.email ? { reply_to: account.email } : {}),
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!response.ok) {
      console.error("[contact-support] Resend answered", response.status);
      return respond(502, { error: "send_failed" });
    }
  } catch (error) {
    console.error("[contact-support] Resend couldn't be reached:", (error as Error).name);
    return respond(502, { error: "send_failed" });
  }

  // The rate limit's memory. The message has gone, so a failure here only
  // means this send isn't counted.
  try {
    const response = await fetch(`${CLERK_API}/users/${encodeURIComponent(userId)}/metadata`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${clerkSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ private_metadata: { support: { sent: [...recent, now].slice(-RATE_LIMIT) } } }),
    });
    if (!response.ok) console.warn("[contact-support] couldn't record the send:", response.status);
  } catch (error) {
    console.warn("[contact-support] couldn't record the send:", (error as Error).name);
  }

  console.log("[contact-support] sent", body.topic);
  return respond(200, { sent: true });
});
