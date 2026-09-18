/**
 * Turning a database error into something an operator can read — for reads AND
 * writes.
 *
 * This lived in `app/actions/types.ts` and was therefore reachable only by
 * Server Actions, so every *read* in `lib/queries.ts` bypassed it and rendered
 * raw Postgres strings instead. It lives in `lib/` now because a layer shared by
 * both sides belongs beside `queries.ts` and `catalog-mappers.ts`, not inside
 * the actions folder: `types.ts` has no `"use server"` directive today, but
 * every sibling does, and the moment one is added these pure synchronous
 * functions would become async RPC stubs.
 */

/**
 * Why a query failed, as the UI needs to reason about it.
 *
 * The distinction is not cosmetic. A permission failure is deterministic and
 * must never be retried; a network failure is transient and usually clears on
 * its own. Telling an operator to check their account access after a dropped
 * packet sends them to audit Clerk roles for a fault that fixes itself.
 */
export type DbErrorKind =
  | "permission"
  | "conflict"
  | "network"
  | "skew"
  | "unknown";

type DbError = { code?: string; message: string };

/**
 * An error carrying no message at all.
 *
 * postgrest-js surfaces a caught transport failure as an error object whose
 * body it never got to read, so `.message` can be empty. Interpolated into a
 * template this produced the dangling `"Could not count missing audio: "` an
 * operator saw on the Dashboard and could not act on. Empty is not a message.
 */
function hasNoMessage(message: string): boolean {
  return message.trim() === "";
}

/**
 * Network-level failures never carry a Postgres error code, so they're matched
 * on shape instead: a bare `TypeError` (the standard shape for a failed
 * `fetch()` in both browsers and Node/undici) or the literal phrases those
 * runtimes use for a connection that never completed.
 */
export function isNetworkError(message: string): boolean {
  return (
    /^TypeError:\s*fetch failed/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /network\s*(error|request failed)/i.test(message) ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/.test(message)
  );
}

/**
 * A token rejected for TIMING rather than for content.
 *
 * Clerk stamps a token's `nbf`/`iat` from the client's clock and its `exp` from
 * the same; Postgres validates against its own. A client running even two
 * seconds behind therefore mints tokens that are "not yet valid" on arrival, and
 * one running ahead produces tokens that read as already expired.
 *
 * This is the only failure class in this file that fixes itself by WAITING —
 * the token becomes valid the moment the skew elapses. It is neither a
 * permission problem (the account is fine) nor a network one (the request
 * arrived and was understood), and classifying it as either sends an operator
 * to audit Clerk roles or their wifi for a clock problem.
 *
 * Observed on this project: a dev machine 2-3s behind Supabase, which surfaced
 * on bulk import because its preflight fires three queries the instant the
 * button is clicked — the tightest mint-to-use gap anywhere in the app.
 */
export function isSkewError(message: string): boolean {
  return (
    /jwt\s*(is\s*)?not\s*yet\s*valid/i.test(message) ||
    /token\s*used\s*before\s*issued/i.test(message) ||
    /\bnbf\b/i.test(message) ||
    /jwt\s*(is\s*)?expired/i.test(message)
  );
}

/**
 * Classifies a failure.
 *
 * Code tests come FIRST, before the empty-message check: an error can carry a
 * real Postgres code and still have no message, and `42501` with an empty body
 * is a permission problem, not a connectivity one. Getting that order wrong
 * would tell someone to check their connection when their account genuinely
 * lacks access.
 */
export function classifyDbError(error: DbError): DbErrorKind {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "permission";
  }
  if (error.code === "23505") {
    return "conflict";
  }
  // Before the network test: a skewed token is a specific, self-healing fault
  // with its own remedy, and "check your connection" would send an operator
  // looking in the wrong place entirely.
  if (isSkewError(error.message)) {
    return "skew";
  }
  if (hasNoMessage(error.message) || isNetworkError(error.message)) {
    return "network";
  }
  return "unknown";
}

/**
 * Turns a Supabase error into something an operator can read.
 *
 * An RLS rejection must never surface as a generic failure or, worse, as a
 * silent success — see AGENTS.md. Postgres reports it as a policy violation,
 * which is meaningless to the person holding the mouse.
 *
 * A network-level failure (the underlying `fetch()` itself failing — a
 * connectivity blip, a DNS hiccup) is caught by supabase-js/postgrest-js and
 * returned as `{ error }` rather than thrown, so it reaches here looking like
 * any other database error. Its `.message` is a raw JS string like
 * `"TypeError: fetch failed"` — never let that reach the UI verbatim; it reads
 * like a stack trace to an operator who cannot act on it.
 *
 * Written as a switch over `classifyDbError` so the message and the kind the UI
 * renders alongside it cannot drift apart.
 */
export function describeDbError(error: DbError): string {
  switch (classifyDbError(error)) {
    case "permission":
      return "Your account doesn't have permission to make this change.";
    case "conflict":
      return "That value is already taken.";
    case "network":
      return "Couldn't reach the database. Check your connection and try again.";
    case "skew":
      // Names the actual remedy. "Try again" alone would be a lie for a clock
      // that is permanently wrong rather than momentarily so.
      return "Your computer's clock is out of step with the server, so your sign-in token was rejected. Sync your system clock and try again.";
    case "unknown":
      return error.message;
  }
}
