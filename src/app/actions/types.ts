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
 * Re-exported from `lib/db-errors.ts`, where the implementation now lives so
 * that reads (`lib/queries.ts`) can share it — previously it sat here and was
 * therefore reachable only by writes, which is why every read rendered raw
 * Postgres strings.
 *
 * Kept as a re-export so the four action files keep their existing grouped
 * import and none of the 13 write call sites had to change. If `"use server"`
 * is ever added to this file, this one line breaks loudly instead of thirteen
 * call sites breaking quietly.
 */
export { describeDbError } from "@/lib/db-errors";
