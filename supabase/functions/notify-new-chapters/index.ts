// notify-new-chapters: new-chapter alerts for the Talebrim mobile app (its
// prompt 23a). The project's first Edge Function.
//
// Called every minute by pg_cron through pg_net (migration 20260928130000;
// every 5 minutes until 20260930130000), with a shared secret in the `x-notify-secret` header: the
// same value is in Supabase Vault, where the schedule reads it, and in this
// function's secrets as NOTIFY_CRON_SECRET. Any other caller gets 403. It is
// deployed with verify_jwt off (supabase/config.toml), as Supabase's docs
// require for a function not called with a user's token under the
// sb_publishable_/sb_secret_ keys; the secret is its authentication.
//
// Each run:
//   1. Checks the receipts of tickets at least 15 minutes old, deletes the
//      tokens Expo reports as DeviceNotRegistered, counts every other
//      receipt error by its code in the run's report (`receipt_errors`), and
//      drops tickets older than a day.
//   2. Records chapters newly readable in published books
//      (notify_find_new_chapters()).
//   3. For each book due an alert (notify_due_books(): any readable chapter
//      not yet announced; since 20260930130000 with no quiet wait and no
//      24-hour cap), sends one message per phone of each reader with the
//      book on My List, in batches of 100, then marks the chapters sent
//      (notify_mark_sent()). Chapters found in the same run share one alert. A book on no one's list is marked sent with
//      nothing sent. A failed send leaves its chapters for the next run.
//
// It never runs inside a dashboard write, so nothing it does can fail one.
//
// Secrets, none of which leave this function: its own project's secret key
// (injected by Supabase), EXPO_ACCESS_TOKEN (Expo's enhanced push security)
// and NOTIFY_CRON_SECRET. Never the mobile app's, and never in a repo.
// Tokens are never logged.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/**
 * The mobile app's Android channel, created when a reader turns alerts on. High
 * importance, so the alert pops up. "new-chapters" until 2026-09-30: default
 * importance, which put alerts silently in the shade. A phone that hasn't made
 * the new channel yet gets Firebase's fallback channel, never nothing.
 */
const CHANNEL_ID = "chapter-alerts";
/** Expo takes at most 100 messages per request. */
const SEND_BATCH = 100;
/** And at most 1000 receipt ids per request. */
const RECEIPT_BATCH = 1000;
/** Expo's receipts are ready within 15 minutes of the send. */
const RECEIPT_AFTER_MS = 15 * 60_000;
/** A ticket whose receipt never came is dropped after a day. */
const TICKET_TTL_MS = 24 * 60 * 60_000;
/**
 * FCM's high priority. Expo's default on Android is normal, which a phone
 * holds while it is idle (Doze), and an aggressive battery manager can hold
 * indefinitely: the owner's first alert never showed (2026-09-30). High is
 * for exactly this, a message the reader sees as a notification.
 */
const PRIORITY = "high";

type Chapter = { id: string; number: number; title: string | null };
type DueBook = { book_id: string; title: string | null; chapters: Chapter[] | null; tokens: string[] };

type Ticket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };
type Receipt = { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } };

type Report = {
  receipts_checked: number;
  found: number;
  books_due: number;
  books_sent: number;
  books_without_readers: number;
  books_failed: number;
  messages: number;
  tokens_removed: number;
  /** Tickets Expo refused at send, and receipts that came back an error, by error code. */
  ticket_errors: Record<string, number>;
  receipt_errors: Record<string, number>;
};

function countError(counts: Record<string, number>, code: string): void {
  counts[code] = (counts[code] ?? 0) + 1;
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

/** Compares the secret in constant time, so its length and prefix can't be probed. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** The alert's words. Plain, never promotional. */
export function alertCopy(bookTitle: string | null, chapters: Chapter[]): { title: string; body: string } {
  const book = bookTitle?.trim() || "a story on My List";
  if (chapters.length === 1) {
    const [chapter] = chapters;
    const name = chapter.title?.trim();
    return {
      title: `New chapter of ${book}`,
      body: name ? `Chapter ${chapter.number}: ${name}` : `Chapter ${chapter.number}`,
    };
  }
  const first = chapters[0].number;
  const last = chapters[chapters.length - 1].number;
  return { title: `${chapters.length} new chapters of ${book}`, body: `Chapters ${first}–${last}` };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function expoPost<T>(url: string, accessToken: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as { data?: T; errors?: unknown } | null;
  if (!response.ok || json === null || json.data === undefined) {
    throw new Error(`Expo answered ${response.status}: ${JSON.stringify(json?.errors ?? null)}`);
  }
  return json.data;
}

async function removeTokens(db: SupabaseClient, tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const { error, count } = await db.from("push_tokens").delete({ count: "exact" }).in("token", tokens);
  if (error) throw error;
  return count ?? 0;
}

/** Step 1: receipts of tickets old enough to have one; unregistered phones are forgotten. */
async function checkReceipts(db: SupabaseClient, accessToken: string, report: Report): Promise<void> {
  const now = Date.now();
  const { error: dropError } = await db
    .from("push_tickets")
    .delete()
    .lt("created_at", new Date(now - TICKET_TTL_MS).toISOString());
  if (dropError) throw dropError;

  const { data: tickets, error } = await db
    .from("push_tickets")
    .select("id, token")
    .lte("created_at", new Date(now - RECEIPT_AFTER_MS).toISOString())
    .order("created_at")
    .limit(RECEIPT_BATCH);
  if (error) throw error;
  if (!tickets || tickets.length === 0) return;

  const receipts = await expoPost<Record<string, Receipt>>(EXPO_RECEIPTS_URL, accessToken, {
    ids: tickets.map((ticket) => ticket.id),
  });

  const answered: string[] = [];
  const unregistered: string[] = [];
  for (const ticket of tickets) {
    const receipt = receipts[ticket.id];
    // Not ready yet: tried again next run, until the ticket is a day old.
    if (!receipt) continue;
    answered.push(ticket.id);
    if (receipt.status !== "error") continue;
    const code = receipt.details?.error ?? "unknown";
    countError(report.receipt_errors, code);
    if (code === "DeviceNotRegistered") unregistered.push(ticket.token);
    // Never the token: the ticket id is enough to look the receipt up.
    else console.warn(`[notify] receipt ${ticket.id} came back ${code}: ${receipt.message ?? ""}`);
  }
  report.receipts_checked = answered.length;
  report.tokens_removed += await removeTokens(db, unregistered);
  if (answered.length > 0) {
    const { error: deleteError } = await db.from("push_tickets").delete().in("id", answered);
    if (deleteError) throw deleteError;
  }
}

/**
 * Step 3 for one book. True once every batch reached Expo. A ticket that
 * errors for one phone doesn't fail the book: only a request Expo refused, or
 * one that never arrived, does.
 */
async function sendBook(db: SupabaseClient, accessToken: string, book: DueBook, report: Report): Promise<boolean> {
  const chapters = book.chapters ?? [];
  const { title, body } = alertCopy(book.title, chapters);
  const tickets: { id: string; token: string }[] = [];
  const unregistered: string[] = [];
  let failed = false;

  for (const batch of chunks(book.tokens, SEND_BATCH)) {
    const messages = batch.map((to) => ({
      to,
      title,
      body,
      data: { book_id: book.book_id },
      channelId: CHANNEL_ID,
      priority: PRIORITY,
    }));
    try {
      const results = await expoPost<Ticket[]>(EXPO_SEND_URL, accessToken, messages);
      results.forEach((ticket, i) => {
        const token = batch[i];
        if (ticket.status === "ok") {
          tickets.push({ id: ticket.id, token });
          return;
        }
        const code = ticket.details?.error ?? "unknown";
        countError(report.ticket_errors, code);
        if (code === "DeviceNotRegistered") unregistered.push(token);
        else console.warn(`[notify] a message for book ${book.book_id} was refused: ${code}: ${ticket.message ?? ""}`);
      });
      report.messages += results.filter((ticket) => ticket.status === "ok").length;
    } catch (error) {
      failed = true;
      console.error(`[notify] sending for book ${book.book_id} failed`, error);
    }
  }

  if (tickets.length > 0) {
    const { error } = await db.from("push_tickets").insert(tickets);
    if (error) console.error("[notify] recording tickets failed", error);
  }
  report.tokens_removed += await removeTokens(db, unregistered);
  return !failed;
}

async function markSent(db: SupabaseClient, book: DueBook, sent: boolean): Promise<void> {
  const { error } = await db.rpc("notify_mark_sent", {
    p_book_id: book.book_id,
    p_chapter_ids: (book.chapters ?? []).map((chapter) => chapter.id),
    p_sent: sent,
  });
  if (error) throw error;
}

async function run(db: SupabaseClient, accessToken: string): Promise<Report> {
  const report: Report = {
    receipts_checked: 0,
    found: 0,
    books_due: 0,
    books_sent: 0,
    books_without_readers: 0,
    books_failed: 0,
    messages: 0,
    tokens_removed: 0,
    ticket_errors: {},
    receipt_errors: {},
  };

  // Receipts never hold up new alerts.
  await checkReceipts(db, accessToken, report).catch((error) => console.error("[notify] receipts failed", error));

  const found = await db.rpc("notify_find_new_chapters");
  if (found.error) throw found.error;
  report.found = found.data ?? 0;

  const due = await db.rpc("notify_due_books");
  if (due.error) throw due.error;
  const books = (due.data ?? []) as DueBook[];
  report.books_due = books.length;

  for (const book of books) {
    if ((book.chapters ?? []).length === 0) continue;
    if (book.tokens.length === 0) {
      await markSent(db, book, false);
      report.books_without_readers += 1;
      continue;
    }
    if (await sendBook(db, accessToken, book, report)) {
      await markSent(db, book, true);
      report.books_sent += 1;
    } else {
      report.books_failed += 1;
    }
  }

  return report;
}

Deno.serve(async (request) => {
  const expected = Deno.env.get("NOTIFY_CRON_SECRET");
  const given = request.headers.get("x-notify-secret");
  if (!expected || !given || !sameSecret(given, expected)) {
    return new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (!accessToken) {
    console.error("[notify] EXPO_ACCESS_TOKEN is not set");
    return new Response("Not configured", { status: 500 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return new Response("Not configured", { status: 500 });
  const db = createClient(url, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const report = await run(db, accessToken);
    console.log("[notify]", JSON.stringify(report));
    return Response.json(report);
  } catch (error) {
    console.error("[notify] run failed", error);
    return new Response("Failed", { status: 500 });
  }
});
