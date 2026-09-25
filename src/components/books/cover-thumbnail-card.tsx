"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCoverUploadUrl,
  removeBookCover,
  setBookCover,
} from "@/app/actions/covers";
import { formatBytes } from "@/lib/catalog";
import { COVER_CACHE_CONTROL, prepareCover } from "@/lib/cover-image";
import type { CoverAsset } from "@/types/catalog";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** The uploaded file's limit, matching the bucket. It applies after compression. */
const MAX_BYTES = 2 * 1024 * 1024;
/** The chosen file's limit. A 20 MB source compresses far below `MAX_BYTES`. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const TARGET_WIDTH = 800;
const TARGET_HEIGHT = 1200;
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Races a promise against a timeout so a stalled upstream dependency (an
 * unresolved Clerk session, a dropped connection) reaches the card's existing
 * `failed` state instead of leaving the progress bar stuck indefinitely.
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
  | { status: "preparing" }
  | { status: "uploading"; uploadedBytes: number; totalBytes: number }
  | { status: "persisting" }
  | { status: "removing" }
  | { status: "failed"; message: string };

/** A file chosen before the book exists, held until Create Story runs. */
type PendingFile = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

export type CoverThumbnailCardHandle = {
  /**
   * How many progress steps flush() will report — 1 when a cover is waiting,
   * 0 otherwise.
   *
   * Called by the Create Story dialog BEFORE the flush chain starts, so the
   * progress bar's denominator is known up front and every count it shows is
   * real rather than estimated.
   */
  pendingSteps: () => number;
  /**
   * Uploads a file picked before the book existed, against the new book id.
   * Returns silently when nothing is pending.
   *
   * `report` is called once per completed step, with a label naming what just
   * finished.
   */
  flush: (bookId: string, report?: (label: string) => void) => Promise<void>;
};

/**
 * Uploads straight to storage with XHR rather than fetch, because only XHR
 * exposes upload progress events. The file body never passes through the app
 * server — it goes to the signed URL and nowhere else.
 */
function uploadToSignedUrl(
  url: string,
  file: File,
  onProgress: (uploadedBytes: number) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("Cache-Control", COVER_CACHE_CONTROL);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve({ ok: true });
      } else if (request.status === 400 || request.status === 403) {
        resolve({
          ok: false,
          message: "The upload link expired. Try again.",
        });
      } else {
        resolve({
          ok: false,
          message: `Storage rejected the upload (${request.status}).`,
        });
      }
    };
    request.onerror = () =>
      resolve({ ok: false, message: "Network error during upload." });
    request.onabort = () =>
      resolve({ ok: false, message: "Upload cancelled." });

    request.send(file);
  });
}

export const CoverThumbnailCard = forwardRef<
  CoverThumbnailCardHandle,
  { cover: CoverAsset; bookId: string }
>(function CoverThumbnailCard({ cover, bookId }, ref) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CardState>({ status: "idle" });
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [dimensionNote, setDimensionNote] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // In create mode there is no book id to build a storage path under, so the
  // file is held and uploaded by flush() once Create Story has saved the row —
  // same deferral as the Manuscript card and Chapter composer.
  const isDeferred = bookId === "";
  const busy =
    state.status === "preparing" ||
    state.status === "uploading" ||
    state.status === "persisting" ||
    state.status === "removing";

  const displayed = pendingFile
    ? {
        url: pendingFile.previewUrl,
        fileName: pendingFile.file.name,
        sizeBytes: pendingFile.file.size,
        isLocal: true,
      }
    : cover.state === "ready"
      ? {
          url: cover.url,
          fileName: cover.fileName,
          sizeBytes: cover.sizeBytes,
          isLocal: false,
        }
      : null;

  async function validateAndHold(source: File): Promise<PendingFile | null> {
    if (!ACCEPTED_TYPES.includes(source.type)) {
      toast.error(
        `${source.name} is a ${source.type || "unrecognised"} file. Covers must be JPG, PNG or WebP.`,
      );
      return null;
    }
    if (source.size > MAX_SOURCE_BYTES) {
      toast.error(
        `${source.name} is ${formatBytes(source.size)}. Choose an image of 20 MB or smaller.`,
      );
      return null;
    }

    // Compressed to WebP before anything else, so the preview, the size shown
    // and the upload are all the file readers will download (AGENTS.md
    // § Upload Rules, "Cover images").
    setState({ status: "preparing" });
    const { file, width, height } = await prepareCover(source);
    setState({ status: "idle" });

    if (file.size > MAX_BYTES) {
      toast.error(
        `${file.name} is ${formatBytes(file.size)}. Covers must be 2 MB or smaller.`,
      );
      return null;
    }

    const previewUrl = URL.createObjectURL(file);

    // A wrong ratio is a warning, never a rejection: operators source art from
    // many places, and a visibly-wrong cover is fixable where an unuploadable
    // one is not.
    setDimensionNote(
      width > 0 && (width !== TARGET_WIDTH || height !== TARGET_HEIGHT)
        ? `This image is ${width}×${height}. Covers display best at ${TARGET_WIDTH}×${TARGET_HEIGHT}.`
        : null,
    );

    return { file, previewUrl, width, height };
  }

  /**
   * Full upload → persist cycle against a known book id.
   *
   * Wrapped in try/catch and each Server Action call raced against a timeout:
   * both calls need a resolved Clerk session (client-side for the request,
   * server-side inside requireAdmin()). If that session is unavailable — a
   * stalled Clerk script load, a dropped connection — the call would otherwise
   * never resolve, leaving the progress bar stuck at its initial state forever
   * rather than reaching the `failed` UI this card already renders correctly.
   */
  async function uploadFor(
    targetBookId: string,
    pending: PendingFile,
  ): Promise<boolean> {
    setState({
      status: "uploading",
      uploadedBytes: 0,
      totalBytes: pending.file.size,
    });

    try {
      const signed = await withTimeout(
        createCoverUploadUrl({
          bookId: targetBookId,
          fileName: pending.file.name,
          contentType: pending.file.type,
          sizeBytes: pending.file.size,
        }),
        "Timed out starting the upload. Check your connection and try again.",
      );

      if (!signed.ok) {
        setState({ status: "failed", message: signed.formError });
        return false;
      }

      const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/covers/${signed.data.path}?token=${signed.data.token}`;

      const uploaded = await uploadToSignedUrl(
        endpoint,
        pending.file,
        (uploadedBytes) =>
          setState({
            status: "uploading",
            uploadedBytes,
            totalBytes: pending.file.size,
          }),
      );

      if (!uploaded.ok) {
        setState({ status: "failed", message: uploaded.message });
        return false;
      }

      // The object exists; only now may the row point at it.
      setState({ status: "persisting" });

      const persisted = await withTimeout(
        setBookCover({
          bookId: targetBookId,
          path: signed.data.path,
          fileName: pending.file.name,
          sizeBytes: pending.file.size,
          width: pending.width || TARGET_WIDTH,
          height: pending.height || TARGET_HEIGHT,
          previousPath:
            cover.state === "ready" ? coverPathFromUrl(cover.url) : null,
        }),
        "Timed out saving the cover. The file uploaded, but try Replace to confirm it saved.",
      );

      if (!persisted.ok) {
        setState({ status: "failed", message: persisted.formError });
        return false;
      }

      setState({ status: "idle" });
      setPendingFile(null);
      URL.revokeObjectURL(pending.previewUrl);
      return true;
    } catch (error) {
      setState({
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  }

  useImperativeHandle(ref, () => ({
    pendingSteps() {
      return pendingFile ? 1 : 0;
    },
    async flush(newBookId: string, report?: (label: string) => void) {
      if (!pendingFile) return;
      const ok = await uploadFor(newBookId, pendingFile);
      if (ok) toast.success("Cover uploaded.");
      // Reported even on failure: the step is over either way, and a bar that
      // stalls on a failed step looks identical to one that hung.
      report?.("Cover uploaded");
    },
  }));

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const pending = await validateAndHold(file);
    if (!pending) return;

    if (isDeferred) {
      setPendingFile(pending);
      return;
    }

    setPendingFile(pending);
    const ok = await uploadFor(bookId, pending);
    if (ok) {
      toast.success("Cover uploaded.");
      // No router.refresh() — setBookCover() already revalidated this route and
      // the action response carries the refreshed payload. See AGENTS.md,
      // Performance Rules.
    }
  }

  async function handleRemove() {
    setState({ status: "removing" });
    const result = await removeBookCover(bookId);

    if (!result.ok) {
      setState({ status: "failed", message: result.formError });
      setConfirmingRemove(false);
      return;
    }

    setState({ status: "idle" });
    setDimensionNote(null);
    setConfirmingRemove(false);
    toast.success("Cover removed.");
    // removeBookCover() already revalidated this route — see above.
  }

  function retry() {
    setState({ status: "idle" });
    fileInputRef.current?.click();
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="card__header-title">Cover thumbnail</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        disabled={busy}
        onChange={handleFileChange}
      />

      <div className="aspect-[2/3] w-full max-w-[200px] overflow-hidden rounded-input border border-dashed border-border bg-page">
        {state.status === "preparing" ? (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center">
            <p className="text-helper text-muted">Compressing…</p>
          </div>
        ) : state.status === "uploading" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
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
              {formatBytes(state.uploadedBytes)} / {formatBytes(state.totalBytes)}
            </p>
          </div>
        ) : state.status === "failed" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-helper text-destructive">{state.message}</p>
            <Button variant="muted" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : displayed ? (
          <Image
            src={displayed.url}
            alt="Cover preview"
            width={400}
            height={600}
            className="h-full w-full object-cover"
            unoptimized={displayed.isLocal}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-helper text-muted">
              Drop a cover image, or choose a file
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-input border border-border bg-card px-3 py-1.5 text-body text-text hover:bg-page"
            >
              Choose file
            </button>
          </div>
        )}
      </div>

      {displayed && state.status !== "uploading" && state.status !== "failed" && (
        <>
          <p className="font-mono text-mono text-muted">
            {displayed.fileName} · {formatBytes(displayed.sizeBytes)}
          </p>
          {state.status === "persisting" && (
            <p className="text-helper text-muted">Saving…</p>
          )}
          <div className="flex items-center gap-3">
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
              onClick={() => {
                if (pendingFile) {
                  URL.revokeObjectURL(pendingFile.previewUrl);
                  setPendingFile(null);
                  setDimensionNote(null);
                  return;
                }
                setConfirmingRemove(true);
              }}
              className="text-helper text-destructive hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </>
      )}

      {dimensionNote && (
        <p className="field-group__helper">{dimensionNote}</p>
      )}

      {isDeferred && pendingFile && (
        <p className="field-group__helper">
          This cover is uploaded when you press Create Story.
        </p>
      )}

      <p className="field-group__helper">
        JPG, PNG or WebP · {TARGET_WIDTH}×{TARGET_HEIGHT} · max 20MB · saved
        as WebP
      </p>

      <Dialog
        open={confirmingRemove}
        onOpenChange={(open) => !busy && setConfirmingRemove(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this cover?</DialogTitle>
            <DialogDescription>
              The image is deleted from storage and this book returns to the
              placeholder thumbnail. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
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
              onClick={handleRemove}
            >
              {state.status === "removing" ? "Removing…" : "Remove cover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

/** Recovers the storage path from a public cover URL, for replace-then-delete. */
function coverPathFromUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/covers/";
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}
