"use client";

import { useRef, useState } from "react";
import { Check, Music, Pause, Play } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import * as tus from "tus-js-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAudioPlaybackUrl,
  createAudioUploadUrl,
  discardAudioUpload,
  removeChapterAudio,
  setChapterAudio,
} from "@/app/actions/audio";
import { formatBytes, formatDuration } from "@/lib/catalog";
import type { AudioAsset } from "@/types/catalog";

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Deletes any tus fingerprints left in localStorage.
 *
 * Turning `storeFingerprintForResuming` off stops NEW fingerprints being
 * written, but does nothing about ones already stored — and a stale fingerprint
 * is fatal here: tus tries to resume the upload URL it names, that URL's signed
 * token no longer exists, and the attempt dies inside the client without ever
 * calling our Server Action. Observed in testing as an upload that failed
 * forever with nothing in the server log and no request in the Network panel.
 *
 * Wrapped in try/catch because localStorage throws in private-browsing modes
 * and when site data is blocked; failing to tidy up must never break the card.
 */
function clearStaleTusFingerprints(): void {
  try {
    const stale = Object.keys(window.localStorage).filter((key) =>
      key.startsWith("tus::"),
    );
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // No localStorage access. Nothing to clean, and nothing to report.
  }
}

/**
 * Supabase's resumable endpoint requires exactly 6 MB chunks. Their docs say
 * "it must be set to 6MB (for now) do not change it".
 */
const CHUNK_SIZE = 6 * 1024 * 1024;

/**
 * The least lifetime a token may carry into a chunk request.
 *
 * Clerk session tokens live 60 seconds, and `getToken()` keeps serving its
 * cached token until roughly 10 seconds before expiry. A 6 MB chunk measured
 * ~5 seconds to Cloudflare's nearest edge from the operator's machine
 * (2026-09-23) and longer to us-east-1 — so a cached token near the end of its
 * life can expire while its chunk is still in flight. Below this threshold a
 * fresh token is forced, so every chunk starts with most of a full minute.
 */
const MIN_TOKEN_SECONDS = 45;

/**
 * Seconds until a JWT's `exp`, read from its payload without verifying it.
 *
 * Verification is Storage's job; this only decides whether to ask Clerk for a
 * newer token. Returns null for anything that does not decode, which the
 * caller treats as "refresh".
 */
function tokenSecondsLeft(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: unknown };
    return typeof json.exp === "number"
      ? Math.round(json.exp - Date.now() / 1000)
      : null;
  } catch {
    return null;
  }
}

/**
 * Races a Server Action against a timeout.
 *
 * Same guard as the cover upload: a call that needs a Clerk session can hang
 * forever if that session is unavailable, leaving a progress bar stuck at its
 * initial state rather than reaching a `failed` the operator can act on.
 */
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), REQUEST_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type CardState =
  | { status: "idle" }
  | { status: "uploading"; uploadedBytes: number; totalBytes: number }
  | { status: "processing" }
  | { status: "removing" }
  | { status: "failed"; message: string };

function parseMmSs(value: string): number | null {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Reads duration from the chosen file before it leaves the browser.
 *
 * Resolves null when `loadedmetadata` reports Infinity or NaN — real behaviour
 * for some encodings. A file with no measurable duration is still a valid
 * upload, so this never rejects.
 */
function detectDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    probe.onloadedmetadata = () => {
      finish(Number.isFinite(probe.duration) ? Math.round(probe.duration) : null);
    };
    probe.onerror = () => finish(null);
    probe.src = url;
  });
}

/**
 * Maps any upload failure onto an operator-readable message.
 *
 * Every failure path routes through here, including the Server Action call that
 * happens before TUS exists. Offline, that call throws a bare
 * `TypeError: Failed to fetch`, and rendering `error.message` verbatim put a
 * browser internal on screen — the same defect `describeDbError` exists to
 * prevent for database errors. Nothing raw reaches the card.
 */
function describeUploadError(error: unknown, status?: number): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  // The response BODY, which is where Storage says what actually went wrong.
  // This used to be `String(originalResponse)` — which is "[object Object]",
  // so every body-only reason was invisible to the matching below.
  const body =
    error && typeof error === "object" && "originalResponse" in error
      ? ((
          error as { originalResponse?: { getBody?: () => unknown } }
        ).originalResponse?.getBody?.() ?? "")
      : "";
  const text = `${raw} ${typeof body === "string" ? body : ""}`;

  // Auth, matched FIRST — before the "expired" branch below, which would
  // otherwise read "jwt expired" as a stale 24-hour upload URL and send the
  // operator after the wrong cause.
  //
  // A row-level-security denial and an expired token both arrive as 403, and
  // they mean opposite things: one is "you may not", the other is "you may,
  // but the pass you showed ran out". Only the second is fixed by retrying.
  if (/row-level security|violates.*policy/i.test(text)) {
    return "Your account isn't allowed to upload narration. Ask an admin to check your role.";
  }
  if (
    status === 401 ||
    /jwt|"?exp"? claim|token.*expired|unauthori[sz]ed|invalid signature|session expired/i.test(
      text,
    )
  ) {
    return "Your sign-in lapsed partway through the upload. Retry — it will use a fresh session.";
  }

  // Storage's own size ceiling, which sits BELOW the bucket's file_size_limit
  // and cannot be raised from the bucket config. Observed verbatim as
  // "Maximum size exceeded" with HTTP 413 on the creation request — that
  // request carries no bytes, only a declared Upload-Length, so this is always
  // a verdict on the file's size rather than on the transfer.
  //
  // Matched before the generic branches: without this it fell through to
  // "Check your connection", sending an operator to debug their network over a
  // file that was simply too big.
  if (
    status === 413 ||
    /maximum size exceeded|payload too large|entity too large/i.test(text)
  ) {
    return "This file is larger than storage accepts. Try a smaller file, or split the narration.";
  }
  // The bucket's allowed_mime_types is the real boundary, and it has drifted
  // from Settings before (Settings lists .aac; the bucket does not accept it).
  if (status === 415 || /mime type|invalid_mime/i.test(text)) {
    return "Storage doesn't accept this audio type. Use .m4a, .mp3 or .wav.";
  }
  if (status === 409 || /\bconflict\b/i.test(text)) {
    return "Upload conflict — another transfer is writing to this path. Retry.";
  }
  // An expired resumable URL surfaces as a 404/410 against an upload that no
  // longer exists. Treated distinctly because the remedy differs: a fresh token
  // is required, and Retry mints one rather than reusing the dead URL.
  if (status === 404 || status === 410) {
    return "Upload link expired after 24 hours. Retry to get a fresh link.";
  }
  // Matched on shape, exactly as isNetworkError does for database failures:
  // a transport error carries no status code to key off.
  if (
    status === undefined &&
    /failed to fetch|fetch failed|network|offline|ERR_INTERNET/i.test(text)
  ) {
    return "Couldn't reach storage. Check your connection and retry.";
  }
  // The honest fallback. This used to read "Check your connection" — which
  // is precisely the one cause already ruled out by the branch above, so it
  // sent operators to debug their network over a failure that had a status
  // code and a reason. The status is stated so the next unknown is
  // diagnosable from the card alone; the full error goes to the console.
  return status
    ? `Upload failed — storage returned ${status}. Retry; if it fails again, the details are in the browser console.`
    : "Upload failed. Retry; if it fails again, the details are in the browser console.";
}

export function ChapterEditorAudioCard({
  audio,
  bookId,
  chapterId,
  chapterNumber,
  onUploaded,
  onPersistDuration,
  durationPending = false,
  acceptedFormats,
  maxSizeMb,
}: {
  audio: AudioAsset;
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  /** Fired after the row has been repointed, so the page can refresh. */
  onUploaded: () => void;
  /**
   * Persists a manually-entered duration immediately, independently of the
   * form's Save. This is the fallback for detection reporting Infinity/NaN.
   */
  onPersistDuration?: (seconds: number) => Promise<boolean>;
  durationPending?: boolean;
  /** From app_settings — never constants. See AGENTS.md, prompt 16 notes. */
  acceptedFormats: string[];
  maxSizeMb: number;
}) {
  // The operator's own Clerk session token authorises the transfer. Supabase's
  // resumable endpoint requires a real JWT (this project's anon/service keys are
  // the newer non-JWT `sb_*` format and are rejected at parse), and `is_admin()`
  // reads `metadata.role` from this same token — so RLS sees the real caller.
  const { getToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);
  const uploadedPathRef = useRef<string | null>(null);
  const [state, setState] = useState<CardState>({ status: "idle" });
  const [playing, setPlaying] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState("");
  const [durationError, setDurationError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [loadingPlayback, setLoadingPlayback] = useState(false);

  const busy =
    state.status === "uploading" ||
    state.status === "processing" ||
    state.status === "removing";

  const previousPath = audio.state === "ready" ? audio.path : null;

  async function startUpload(file: File) {
    // Purge anything a previous build left behind before constructing an
    // upload, so a fingerprint written when resuming was still enabled cannot
    // strand this one. Cheap, and it makes the card self-healing rather than
    // requiring an operator to clear site data by hand.
    clearStaleTusFingerprints();

    // Client-side checks are a courtesy; createAudioUploadUrl is the boundary.
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!acceptedFormats.map((f) => f.toLowerCase()).includes(extension)) {
      setState({
        status: "failed",
        message: `Narration must be ${acceptedFormats.join(" or ")}. This file is ${extension || "an unrecognised type"}.`,
      });
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setState({
        status: "failed",
        message: `${file.name} is ${formatBytes(file.size)}. Narration must be ${maxSizeMb} MB or smaller.`,
      });
      return;
    }

    setState({ status: "uploading", uploadedBytes: 0, totalBytes: file.size });

    let signed;
    try {
      signed = await withTimeout(
        createAudioUploadUrl({
          bookId,
          chapterId,
          fileName: file.name,
          sizeBytes: file.size,
        }),
        "Timed out starting the upload. Check your connection and try again.",
      );
    } catch (error) {
      setState({
        status: "failed",
        message:
          error instanceof Error && /timed out/i.test(error.message)
            ? error.message
            : describeUploadError(error),
      });
      return;
    }

    if (!signed.ok) {
      setState({ status: "failed", message: signed.formError });
      return;
    }

    const { path, contentType } = signed.data;
    uploadedPathRef.current = path;

    const clerkToken = await getToken();
    if (!clerkToken) {
      setState({
        status: "failed",
        message: "Your session expired. Reload the page and try again.",
      });
      return;
    }

    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`;

    // What the most recent request carried, so a failure can say which request
    // it was and how much life its token had. Without this, "the token expired"
    // and "the token was rejected while valid" look identical.
    let lastRequest: { method: string; tokenSecondsLeft: number | null } | null =
      null;

    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      // The Clerk session token, not a signed upload token. Verified against
      // the live project: `x-signature` is rejected at JWT parsing, and a signed
      // token sent as a bearer authenticates but fails `audio_insert` because it
      // carries no Clerk identity for `is_admin()` to read.
      //
      // x-upsert is deliberately absent: audio paths are immutable, and
      // overwriting serves stale audio through the CDN until propagation
      // catches up — for narration that means a reader hearing the previous take.
      //
      // A FRESH TOKEN PER REQUEST, not one captured at the start (2026-09-23).
      //
      // This was `headers: { authorization: `Bearer ${clerkToken}` }` — the
      // token fetched once above and replayed on every 6 MB chunk. Clerk
      // session tokens live 60 seconds (AGENTS.md records the same lifetime
      // from prompt 12's storage probes). Any transfer longer than a minute
      // therefore started sending an EXPIRED token partway through, Storage
      // rejected the next PATCH, and the card showed its catch-all message. The
      // failure scaled with upload TIME, not file size — which is why a file
      // under the 50 MB ceiling still failed.
      //
      // getToken() returns Clerk's cached token and only mints a new one near
      // expiry, so calling it per chunk costs almost nothing. A null means the
      // session itself ended; throwing names that, rather than sending an
      // unauthenticated request and reporting whatever Storage says back.
      onBeforeRequest: async (req) => {
        let token = await getToken();
        if (!token) {
          throw new Error("session expired");
        }
        // A per-request token was the first fix and was NOT enough: the
        // cached token can be seconds from expiry when a chunk starts, and a
        // chunk takes seconds to send. Force a fresh one below the threshold.
        // A failed refresh falls back to the cached token rather than failing
        // the chunk outright — it may still be valid, and Storage decides.
        const left = tokenSecondsLeft(token);
        if (left === null || left < MIN_TOKEN_SECONDS) {
          try {
            token = (await getToken({ skipCache: true })) ?? token;
          } catch {
            // keep the cached token
          }
        }
        lastRequest = {
          method: req.getMethod(),
          tokenSecondsLeft: tokenSecondsLeft(token),
        };
        req.setHeader("Authorization", `Bearer ${token}`);
      },
      // FALSE, deliberately — and this was a real bug when it was true.
      //
      // With it on, tus sends the first chunk as the body of the CREATION POST.
      // Paired with the mandatory 6 MB chunkSize that makes every creation
      // request a 6 MB upload, and the endpoint answered `413 Payload Too
      // Large` — observed in the browser against the live project, on a request
      // that had already passed authentication.
      //
      // Off, creation is a bodyless POST that just reserves the upload URL, and
      // every byte travels by PATCH in 6 MB chunks. That is also what makes
      // progress reporting meaningful: with creation carrying the first chunk,
      // the first 6 MB moved before onProgress ever fired.
      uploadDataDuringCreation: false,
      // Fingerprinting is OFF, deliberately, and this is a real limitation
      // worth stating rather than glossing.
      //
      // tus-js-client stores a fingerprint in localStorage so an interrupted
      // upload can resume. That cannot work here: every attempt mints a fresh
      // signed path from createAudioUploadUrl, so a stored fingerprint points at
      // an upload URL whose token no longer exists. Left on, a failed upload
      // made every subsequent Retry try to RESUME the dead URL and fail again —
      // observed directly when testing offline recovery.
      //
      // So resumption across a page reload is NOT achieved; Retry restarts the
      // transfer, which prompt 16 explicitly permits provided it is said plainly.
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: "audio",
        objectName: path,
        contentType,
        cacheControl: "3600",
      },
      chunkSize: CHUNK_SIZE,
      onProgress: (uploadedBytes, totalBytes) => {
        setState({ status: "uploading", uploadedBytes, totalBytes });
      },
      onError: (error) => {
        uploadRef.current = null;
        // tus reports the HTTP status on the error's response, not always in
        // the message — surface it so describeUploadError can match a 413 that
        // arrives with an opaque message body.
        const status =
          error && typeof error === "object" && "originalResponse" in error
            ? (
                error as {
                  originalResponse?: { getStatus?: () => number };
                }
              ).originalResponse?.getStatus?.()
            : undefined;
        // The path is abandoned with the attempt. Left set, a later Cancel
        // would delete an object belonging to a previous, unrelated try.
        uploadedPathRef.current = null;
        // Logged whole, every time. The card shows a translated message; this
        // is the only place the real response survives. The last audio failure
        // on this card cost four wrong diagnoses before anyone read the
        // response body (AGENTS.md, prompt 16) — an error that is swallowed is
        // an error that gets diagnosed by guessing.
        //
        // ONE PLAIN STRING, not an object. The first version logged
        // `{ status, error }`, and the Next.js dev overlay rendered it as `{}` —
        // an Error serialises to nothing — so the evidence this line exists to
        // capture was lost the first time it mattered.
        const responseBody =
          error && typeof error === "object" && "originalResponse" in error
            ? (
                error as {
                  originalResponse?: { getBody?: () => unknown };
                }
              ).originalResponse?.getBody?.()
            : undefined;
        console.error(
          [
            "Narration upload failed",
            `request: ${lastRequest?.method ?? "unknown"}`,
            `status: ${status ?? "no response"}`,
            `token seconds left when sent: ${lastRequest?.tokenSecondsLeft ?? "unknown"}`,
            `response body: ${typeof responseBody === "string" && responseBody ? responseBody : "(empty)"}`,
            `error: ${error instanceof Error ? error.message : String(error)}`,
          ].join("\n"),
        );
        setState({
          status: "failed",
          message: describeUploadError(error, status),
        });
      },
      onSuccess: () => {
        uploadRef.current = null;
        void persistUploaded(file, path);
      },
    });

    uploadRef.current = upload;
    upload.start();
  }

  async function persistUploaded(file: File, path: string) {
    setState({ status: "processing" });

    // Detection runs after the object exists, and its failure is never the
    // upload's failure — the file is in storage and valid either way.
    const durationSeconds = await detectDuration(file);

    let persisted;
    try {
      persisted = await withTimeout(
        setChapterAudio({
          bookId,
          chapterId,
          chapterNumber,
          path,
          fileName: file.name,
          sizeBytes: file.size,
          durationSeconds,
          previousPath,
        }),
        "Timed out saving the narration. The file uploaded — try Replace to confirm it saved.",
      );
    } catch (error) {
      setState({
        status: "failed",
        message:
          error instanceof Error ? error.message : "Couldn't save the narration.",
      });
      return;
    }

    if (!persisted.ok) {
      setState({ status: "failed", message: persisted.formError });
      return;
    }

    uploadedPathRef.current = null;
    setState({ status: "idle" });
    onUploaded();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void startUpload(file);
  }

  async function cancelUpload() {
    const upload = uploadRef.current;
    uploadRef.current = null;
    if (upload) await upload.abort(true);

    // Any bytes that reached storage are cleaned up, so a cancelled upload
    // leaves no orphan and no row change.
    const path = uploadedPathRef.current;
    uploadedPathRef.current = null;
    if (path) await discardAudioUpload(path);

    setState({ status: "idle" });
  }

  async function handleRemove() {
    setState({ status: "removing" });
    const result = await removeChapterAudio({ bookId, chapterId, chapterNumber });

    if (!result.ok) {
      setState({ status: "failed", message: result.formError });
      setConfirmingRemove(false);
      return;
    }

    setState({ status: "idle" });
    setConfirmingRemove(false);
    onUploaded();
  }

  /**
   * Fetches a signed URL the first time play is pressed, then plays.
   *
   * Deferred rather than fetched on render: a signed URL is a server round trip
   * and most visits to a chapter never play the audio. It is also short-lived,
   * so minting it at render time would mean handing out URLs that may expire
   * before anyone presses play.
   */
  async function togglePlay() {
    const el = audioElRef.current;
    if (!el || audio.state !== "ready") return;

    if (playing) {
      el.pause();
      return;
    }

    if (!el.src) {
      setLoadingPlayback(true);
      const result = await createAudioPlaybackUrl(audio.path);
      setLoadingPlayback(false);

      if (!result.ok) {
        setState({ status: "failed", message: result.formError });
        return;
      }
      el.src = result.data.url;
    }

    void el.play().catch(() => {
      setState({
        status: "failed",
        message: "Couldn't play this narration. Try reloading the page.",
      });
    });
  }

  function openEditDuration() {
    if (audio.state !== "ready") return;
    setDurationInput(
      audio.durationSeconds === null ? "" : formatDuration(audio.durationSeconds),
    );
    setDurationError(null);
    setEditingDuration(true);
  }

  async function saveDuration() {
    if (audio.state !== "ready") return;
    const seconds = parseMmSs(durationInput);
    if (seconds === null) {
      setDurationError("Use mm:ss, e.g. 09:14.");
      return;
    }

    if (onPersistDuration) {
      const saved = await onPersistDuration(seconds);
      if (!saved) {
        setDurationError("Couldn't save the duration. Try again.");
        return;
      }
    }
    setEditingDuration(false);
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="card__header-title">Narration audio</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(",")}
        className="hidden"
        disabled={busy}
        onChange={handleFileChange}
      />

      {state.status === "uploading" || state.status === "processing" ? (
        <div className="flex flex-col gap-3 rounded-input border border-dashed border-border bg-page p-4">
          {state.status === "uploading" ? (
            <>
              <p className="text-helper text-muted">Uploading…</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((state.uploadedBytes / state.totalBytes) * 100)}%`,
                  }}
                />
              </div>
              <p className="font-mono text-mono text-muted">
                {formatBytes(state.uploadedBytes)} /{" "}
                {formatBytes(state.totalBytes)}
              </p>
              <button
                type="button"
                onClick={() => void cancelUpload()}
                className="self-start text-helper text-muted hover:text-text"
              >
                Cancel
              </button>
            </>
          ) : (
            <p className="text-helper text-muted">Detecting duration…</p>
          )}
        </div>
      ) : state.status === "failed" ? (
        <div className="flex flex-col gap-3 rounded-input border border-dashed border-border bg-page p-4">
          <p className="text-helper text-destructive">{state.message}</p>
          {/*
            Retry is structural, not per-message: every failure here is
            recoverable by choosing a file again, and a terminal state with no
            way out is the Manuscript-card defect recorded in AGENTS.md.
          */}
          <Button
            variant="muted"
            size="sm"
            className="self-start"
            onClick={() => {
              setState({ status: "idle" });
              fileInputRef.current?.click();
            }}
          >
            Retry
          </Button>
        </div>
      ) : audio.state === "ready" ? (
        <>
          {/* src is set on first play — see togglePlay. */}
          <audio
            ref={audioElRef}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <Music className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate font-mono text-mono text-text">
                {audio.fileName}
              </span>
            </div>
            <button
              type="button"
              aria-label={playing ? "Pause narration" : "Play narration"}
              disabled={loadingPlayback}
              onClick={() => void togglePlay()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {playing ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              {/*
                A null duration is not zero. The file is in storage and valid;
                only the measurement is missing, so this states that plainly and
                puts Edit duration right beside it rather than printing 0:00.
              */}
              {audio.durationSeconds === null ? (
                <span className="status-pill status-pill--warn">
                  Duration not detected
                </span>
              ) : (
                <span className="font-mono text-mono text-text">
                  Duration {formatDuration(audio.durationSeconds)}
                </span>
              )}
              {audio.durationSource === "detected" ? (
                <span className="inline-flex items-center gap-1.5 text-helper text-status-ok">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Detected
                </span>
              ) : audio.durationSource === "manual" ? (
                <span className="text-helper text-muted">Edited</span>
              ) : null}
              <button
                type="button"
                onClick={openEditDuration}
                className="text-helper text-muted hover:text-text"
              >
                Edit duration
              </button>
            </div>
            <p className="font-mono text-mono text-muted">
              Size {formatBytes(audio.sizeBytes)}
            </p>
          </div>

          <div className="flex items-center gap-4 border-t border-border pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="text-helper text-muted hover:text-text disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingRemove(true)}
              className="text-helper text-destructive hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <div className="flex h-[120px] w-full flex-col items-center justify-center gap-3 rounded-input border border-dashed border-border bg-page p-4 text-center">
          <p className="text-helper text-muted">
            Drop a narration file, or choose one
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload audio
          </Button>
        </div>
      )}

      <p className="text-helper text-muted">
        Uploads directly to storage · {acceptedFormats.join(" or ")} · max{" "}
        {maxSizeMb}MB
      </p>

      <Dialog open={editingDuration} onOpenChange={setEditingDuration}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit duration</DialogTitle>
          </DialogHeader>
          <div className="field-group">
            <label className="field-group__label" htmlFor="duration-input">
              Duration (mm:ss)
            </label>
            <Input
              id="duration-input"
              value={durationInput}
              onChange={(event) => setDurationInput(event.target.value)}
              placeholder="09:14"
            />
            {durationError && (
              <p className="field-group__helper field-group__helper--error">
                {durationError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="muted"
              disabled={durationPending}
              onClick={() => setEditingDuration(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={durationPending}
              onClick={saveDuration}
            >
              {durationPending ? "Saving…" : "Save duration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmingRemove}
        onOpenChange={(open) => !busy && setConfirmingRemove(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this narration?</DialogTitle>
          </DialogHeader>
          <p className="card__sub-line">
            The audio file is deleted from storage and this chapter returns to
            the dropzone. This can&apos;t be undone.
          </p>
          <DialogFooter>
            <Button
              variant="muted"
              disabled={busy}
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              {state.status === "removing" ? "Removing…" : "Remove narration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

