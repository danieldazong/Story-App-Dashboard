/**
 * What every Server Action returns.
 *
 * Actions never throw raw Supabase errors at the UI. A form needs to know the
 * difference between "this field is wrong" (render it inline against the input)
 * and "the operation failed" (render it above the primary action), and a
 * Postgres error string is not a message an operator can act on.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; formError: string; fieldErrors?: Record<string, string> };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionError(
  formError: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, formError, fieldErrors };
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
 */
export function describeDbError(error: {
  code?: string;
  message: string;
}): string {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "Your account doesn't have permission to make this change.";
  }
  if (error.code === "23505") {
    return "That value is already taken.";
  }
  if (isNetworkError(error.message)) {
    return "Couldn't reach the database. Check your connection and try again.";
  }
  return error.message;
}

/**
 * Network-level failures never carry a Postgres error code, so they're matched
 * on shape instead: a bare `TypeError` (the standard shape for a failed
 * `fetch()` in both browsers and Node/undici) or the literal phrases those
 * runtimes use for a connection that never completed.
 */
function isNetworkError(message: string): boolean {
  return (
    /^TypeError:\s*fetch failed/i.test(message) ||
    /failed to fetch/i.test(message) ||
    /network\s*(error|request failed)/i.test(message) ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/.test(message)
  );
}
