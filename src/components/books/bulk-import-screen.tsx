"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shell/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createImportTarget,
  finalizeBulkImport,
  ingestImportedScript,
  preflightBulkImport,
} from "@/app/actions/bulk-import";
import {
  evaluateBatch,
  startsChecked,
  summariseBatch,
  type BatchInputRow,
  type BatchRow,
  type BatchRowStatus,
} from "@/lib/bulk-import";
import { countWords } from "@/lib/catalog";
import { extractDocxText } from "@/lib/docx";

/**
 * Bulk script import.
 *
 * The batch runs from the client so each file's body goes browser -> storage
 * directly: 148 files through a Server Action would mean 148 file bodies
 * through the app server. Each server call stays small — mint, then persist.
 */

/** Files per batch. See prompt 10: raise only alongside real virtualisation. */
const MAX_FILES = 150;

/** Files in flight at once. */
const CONCURRENCY = 3;

type RowProgress =
  | { phase: "idle" }
  | { phase: "queued" }
  | { phase: "uploading" }
  | { phase: "reading" }
  | { phase: "imported" }
  | { phase: "failed"; reason: string };

type Phase = "collecting" | "preflight" | "importing" | "settled";

const STATUS_LABEL: Record<BatchRowStatus, string> = {
  new_chapter: "New chapter",
  replaces_script: "Replaces script",
  duplicate_number: "Duplicate number",
  unreadable_file: "Unreadable file",
};

const STATUS_PILL: Record<BatchRowStatus, string> = {
  new_chapter: "status-pill status-pill--ok",
  replaces_script: "status-pill status-pill--warn",
  duplicate_number: "status-pill status-pill--destructive",
  unreadable_file: "status-pill status-pill--destructive",
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

/** Reads a file's text in the browser, for the preview's word count only. */
async function readForPreview(
  file: File,
): Promise<{ text: string | null }> {
  try {
    if (extensionOf(file.name) === ".docx") {
      return { text: await extractDocxText(file) };
    }
    return { text: await file.text() };
  } catch {
    return { text: null };
  }
}

export function BulkImportScreen({
  bookId,
  bookTitle,
  existingNumbers,
  acceptedScriptFormats,
}: {
  bookId: string;
  bookTitle: string;
  existingNumbers: number[];
  /** From app_settings — never constants. See AGENTS.md, prompt 16 notes. */
  acceptedScriptFormats: string[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Files are held by id so an operator's edits survive re-evaluation and the
  // re-sorting that follows it.
  const [inputs, setInputs] = useState<BatchInputRow[]>([]);
  const filesById = useRef(new Map<string, File>());

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, RowProgress>>({});
  const [phase, setPhase] = useState<Phase>("collecting");
  // Fixed when a batch starts, never derived from settled rows: a denominator
  // that grows as work is discovered turns the progress line into a prediction.
  // See AGENTS.md, "Show progress by counting real work".
  const [batchSize, setBatchSize] = useState(0);
  const [reading, setReading] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const highestExisting = useMemo(
    () => (existingNumbers.length === 0 ? 0 : Math.max(...existingNumbers)),
    [existingNumbers],
  );

  // Server-corrected rows win over the local evaluation once preflight has run,
  // so the table shows what the import will actually do.
  const [serverRows, setServerRows] = useState<BatchRow[] | null>(null);

  const localRows = useMemo(
    () => evaluateBatch(inputs, existingNumbers, highestExisting),
    [inputs, existingNumbers, highestExisting],
  );

  const rows = serverRows ?? localRows;

  const summary = useMemo(
    () => summariseBatch(rows, checkedIds),
    [rows, checkedIds],
  );

  const importableCount = summary.newChapters + summary.replacing;
  const busy = phase === "preflight" || phase === "importing";

  const importedCount = useMemo(
    () =>
      Object.values(progress).filter((state) => state.phase === "imported")
        .length,
    [progress],
  );
  const failedCount = useMemo(
    () => Object.values(progress).filter((state) => state.phase === "failed").length,
    [progress],
  );

  // A batch mid-flight has created rows and uploaded objects; leaving would
  // strand them with no result block to act on.
  useEffect(() => {
    if (phase !== "importing") return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const accepted = acceptedScriptFormats.map((format) =>
        format.toLowerCase(),
      );
      const picked = Array.from(fileList);
      const usable = picked.filter((file) =>
        accepted.includes(extensionOf(file.name)),
      );
      const rejected = picked.length - usable.length;

      if (rejected > 0) {
        toast.error(
          `${rejected} ${rejected === 1 ? "file was" : "files were"} not ${accepted.join(", ")} and ${rejected === 1 ? "was" : "were"} skipped.`,
        );
      }
      if (usable.length === 0) return;

      if (inputs.length + usable.length > MAX_FILES) {
        toast.error(
          `A batch is capped at ${MAX_FILES} files. Import in smaller batches.`,
        );
        return;
      }

      setReading(usable.length);

      // Read for the preview's word count. Extraction that MATTERS happens
      // server-side during ingest — this is only so the operator sees what they
      // dropped before committing to it.
      const next: BatchInputRow[] = [];
      for (const file of usable) {
        const id = crypto.randomUUID();
        filesById.current.set(id, file);
        const { text } = await readForPreview(file);
        next.push({
          id,
          fileName: file.name,
          sizeBytes: file.size,
          unreadable: text === null || text.trim() === "",
          wordCount: text === null ? null : countWords(text),
        });
      }

      setReading(0);

      // Seed each NEW row's checkbox here, not in an effect watching the
      // evaluated rows.
      //
      // The effect version was wrong twice over. It needed a "have I already
      // considered this row?" guard so that unchecking a row would not be
      // silently undone on the next evaluation — but that guard marked rows as
      // considered on a pass where nothing got checked, so every row arrived
      // unchecked and the button permanently read "Import 0 chapters".
      //
      // This is the one moment the question has an unambiguous answer: the row
      // did not exist a line ago, so the operator cannot have decided anything
      // about it. Afterwards `checkedIds` is owned solely by the operator, and
      // nothing re-derives it.
      //
      // evaluateBatch runs here against the combined set because status depends
      // on the whole batch — a file is only a duplicate relative to its
      // siblings. It is pure and deterministic, so running it here and in the
      // render memo cannot disagree.
      const combined = [...inputs, ...next];
      const evaluated = evaluateBatch(combined, existingNumbers, highestExisting);
      const newIds = new Set(next.map((row) => row.id));

      setInputs(combined);
      setServerRows(null);
      setCheckedIds((current) => {
        const updated = new Set(current);
        for (const row of evaluated) {
          if (newIds.has(row.id) && startsChecked(row)) updated.add(row.id);
        }
        return updated;
      });
    },
    [acceptedScriptFormats, inputs, existingNumbers, highestExisting],
  );

  function toggle(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function override(id: string, patch: Partial<BatchInputRow>) {
    setServerRows(null);
    setInputs((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function resetBatch() {
    setInputs([]);
    setCheckedIds(new Set());
    setProgress({});
    setServerRows(null);
    setPhase("collecting");
    setBatchSize(0);
    setFormError(null);
    setNotice(null);
    filesById.current.clear();
  }

  /** Uploads one row and persists its text. Returns null on success. */
  async function importRow(
    batchId: string,
    row: BatchRow,
  ): Promise<string | null> {
    const file = filesById.current.get(row.id);
    if (!file) return "The file is no longer available. Drop it again.";

    setProgress((state) => ({ ...state, [row.id]: { phase: "uploading" } }));

    const target = await createImportTarget({
      batchId,
      bookId,
      number: row.number,
      title: row.title,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      replaces: row.status === "replaces_script",
    });

    if (!target.ok) {
      if (target.kind === "permission") throw new Error(target.formError);
      return target.formError;
    }

    const { chapterId, path, token, contentType, previousScriptPath } =
      target.data;

    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/scripts/${path}?token=${token}`;

    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: file,
    });

    if (!response.ok) {
      return `Upload failed (${response.status}).`;
    }

    setProgress((state) => ({ ...state, [row.id]: { phase: "reading" } }));

    const ingested = await ingestImportedScript({
      batchId,
      bookId,
      chapterId,
      chapterNumber: row.number,
      chapterTitle: row.title,
      path,
      fileName: row.fileName,
      previousScriptPath,
    });

    if (!ingested.ok) return ingested.formError;
    return null;
  }

  async function runBatch(targets: BatchRow[]) {
    const batchId = crypto.randomUUID();
    setPhase("importing");
    setBatchSize(targets.length);
    setFormError(null);

    setProgress((state) => {
      const next = { ...state };
      for (const row of targets) next[row.id] = { phase: "queued" };
      return next;
    });

    let replaced = 0;
    let imported = 0;
    let failed = 0;
    let aborted: string | null = null;

    const queue = [...targets];

    async function worker() {
      for (;;) {
        if (aborted) return;
        const row = queue.shift();
        if (!row) return;

        let reason: string | null = null;
        try {
          reason = await importRow(batchId, row);
        } catch (error) {
          // Thrown only for an RLS rejection, which will fail identically for
          // every remaining row — stopping is kinder than 147 more failures.
          aborted =
            error instanceof Error
              ? error.message
              : "The import was stopped by a permissions error.";
          return;
        }

        if (reason === null) {
          imported += 1;
          if (row.status === "replaces_script") replaced += 1;
          setProgress((state) => ({
            ...state,
            [row.id]: { phase: "imported" },
          }));
        } else {
          failed += 1;
          setProgress((state) => ({
            ...state,
            [row.id]: { phase: "failed", reason: reason as string },
          }));
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker),
    );

    // Finalize even on abort: rows that already settled changed the book, and
    // the screens must reflect them.
    await finalizeBulkImport({ batchId, bookId, imported, replaced, failed });

    if (aborted) setFormError(aborted);
    setPhase("settled");
    router.refresh();
  }

  async function handleConfirm() {
    setConfirmOpen(false);
    setPhase("preflight");
    setFormError(null);
    setNotice(null);

    const candidates = rows.filter(
      (row) => !row.blocked && checkedIds.has(row.id),
    );

    const preflight = await preflightBulkImport({ bookId, rows: candidates });

    if (!preflight.ok) {
      setPhase("collecting");
      setFormError(preflight.formError);
      return;
    }

    setServerRows(preflight.data.rows);

    if (preflight.data.corrected) {
      // Do NOT import on this call: the operator is looking at statuses that
      // were true when they dropped the files, and are not any more.
      setPhase("collecting");
      setNotice(
        "The book changed since you dropped these files. Review the updated statuses before importing.",
      );
      return;
    }

    const targets = preflight.data.rows.filter(
      (row) => !row.blocked && checkedIds.has(row.id),
    );

    if (targets.length === 0) {
      setPhase("collecting");
      setFormError("Nothing left to import — every row was blocked.");
      return;
    }

    await runBatch(targets);
  }

  function retryFailed() {
    const failedRows = rows.filter(
      (row) => progress[row.id]?.phase === "failed",
    );
    if (failedRows.length === 0) return;
    void runBatch(failedRows);
  }

  const settledWithFailures = phase === "settled" && failedCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Stories", href: "/books" },
          { label: bookTitle, href: `/books/${bookId}` },
          { label: "Import chapters" },
        ]}
        backLink={{ href: `/books/${bookId}`, label: bookTitle }}
        title="Import chapters"
        action={
          phase === "settled" ? (
            <Button asChild>
              <Link href={`/books/${bookId}`}>Open book</Link>
            </Button>
          ) : (
            <Button
              disabled={importableCount === 0 || busy}
              onClick={() => setConfirmOpen(true)}
            >
              {phase === "preflight"
                ? "Checking…"
                : `Import ${importableCount} ${importableCount === 1 ? "chapter" : "chapters"}`}
            </Button>
          )
        }
      />

      {formError && (
        <p className="field-group__helper field-group__helper--error">
          {formError}
        </p>
      )}
      {notice && <p className="field-group__helper">{notice}</p>}

      <div className="card flex flex-col gap-4 p-6">
        <div className="card__header">
          <div>
            <h2 className="card__header-title">Manuscript files</h2>
            <p className="card__sub-line">
              Drop a folder of chapter files — they&apos;re matched to chapters
              by filename.
            </p>
          </div>
          {inputs.length > 0 && phase === "collecting" && (
            <div className="card__header-actions">
              <Button variant="muted" size="sm" onClick={resetBatch}>
                Remove all
              </Button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedScriptFormats.join(",")}
          className="hidden"
          onChange={(event) => {
            void addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <div
          className="flex h-[160px] w-full flex-col items-center justify-center gap-3 rounded-input border border-dashed border-border bg-page p-4 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (busy) return;
            void addFiles(event.dataTransfer.files);
          }}
        >
          {reading > 0 ? (
            <p className="text-helper text-muted">Reading {reading} files…</p>
          ) : (
            <>
              <p className="text-helper text-muted">
                Drop files here, or choose them
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose files
              </Button>
              <p className="field-group__helper">
                {acceptedScriptFormats.join(", ").toUpperCase()} · up to{" "}
                {MAX_FILES} files
              </p>
            </>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="flex flex-col gap-1 p-6 pb-4">
            <h2 className="card__header-title">Matching preview</h2>
            <p className="card__sub-line">
              Review every row before importing. Nothing is created until you
              confirm.
            </p>
          </div>

          <div className="table-wrapper">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-14" />
                <col className="w-auto" />
                <col className="w-24" />
                <col className="w-64" />
                <col className="w-28" />
                <col className="w-44" />
              </colgroup>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Import</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Chapter #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const state = progress[row.id] ?? { phase: "idle" };
                  const locked = phase !== "collecting";

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={checkedIds.has(row.id)}
                          disabled={row.blocked || locked}
                          onChange={() => toggle(row.id)}
                          aria-label={`Import ${row.fileName}`}
                        />
                      </TableCell>
                      <TableCell className="truncate font-mono text-mono">
                        {row.fileName}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-20 font-mono text-mono"
                          value={row.number}
                          disabled={locked}
                          onChange={(event) =>
                            override(row.id, {
                              numberOverride: Number(event.target.value) || null,
                            })
                          }
                          aria-label={`Chapter number for ${row.fileName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={row.title}
                          disabled={locked}
                          onChange={(event) =>
                            override(row.id, { titleOverride: event.target.value })
                          }
                          aria-label={`Title for ${row.fileName}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-mono">
                        {row.wordCount === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {row.wordCount.toLocaleString()}
                            <Check className="h-3.5 w-3.5 text-status-ok" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {state.phase === "idle" ? (
                          <span className={STATUS_PILL[row.status]}>
                            {STATUS_LABEL[row.status]}
                          </span>
                        ) : state.phase === "imported" ? (
                          <span className="status-pill status-pill--ok">
                            Imported
                          </span>
                        ) : state.phase === "failed" ? (
                          <div className="flex flex-col gap-1">
                            <span className="status-pill status-pill--destructive">
                              Failed
                            </span>
                            <span className="field-group__helper">
                              {state.reason}
                            </span>
                          </div>
                        ) : (
                          <span className="status-pill status-pill--warn">
                            {state.phase === "queued"
                              ? "Queued"
                              : state.phase === "uploading"
                                ? "Uploading"
                                : "Reading text"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border p-6">
            {phase === "importing" || phase === "settled" ? (
              <>
                <div className="flex items-center justify-between">
                  {/*
                    The denominator is the batch size, fixed when the batch
                    started — not a running total of what has settled, which
                    would render "3 of 3" while nine rows were still queued.
                    See AGENTS.md, "Show progress by counting real work".
                  */}
                  <span className="text-helper text-muted">
                    {importedCount} of {batchSize} imported
                    {failedCount > 0 && ` · ${failedCount} failed`}
                  </span>
                </div>
                {/*
                  Inline style for the bar WIDTH only — permitted by AGENTS.md's
                  Style Exception Rules, since a computed percentage cannot be a
                  Tailwind class.
                */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-page">
                  <div
                    className="h-full bg-primary transition-[width] duration-200"
                    style={{
                      width: `${Math.round(
                        ((importedCount + failedCount) /
                          Math.max(1, batchSize)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-helper text-muted">
                  {[
                    summary.newChapters > 0 && `${summary.newChapters} new`,
                    summary.replacing > 0 && `${summary.replacing} replacing`,
                    summary.excluded > 0 && `${summary.excluded} excluded`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Nothing selected"}
                  {summary.blocked > 0 && (
                    <span className="text-destructive">
                      {" "}
                      · {summary.blocked} blocked
                    </span>
                  )}
                </span>
                <span className="text-helper text-muted">
                  Importing into {bookTitle}
                </span>
              </div>
            )}

            {phase === "settled" && (
              <div className="flex flex-wrap items-center gap-3">
                {settledWithFailures && (
                  <Button variant="outline" size="sm" onClick={retryFailed}>
                    Retry failed
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href={`/books/${bookId}`}>Open book</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Import {importableCount}{" "}
              {importableCount === 1 ? "chapter" : "chapters"}?
            </DialogTitle>
            <DialogDescription>
              {summary.newChapters > 0 &&
                `${summary.newChapters} new ${summary.newChapters === 1 ? "chapter" : "chapters"} will be created in ${bookTitle}. `}
              {summary.replacing > 0 &&
                `${summary.replacing} existing ${summary.replacing === 1 ? "chapter's" : "chapters'"} text will be overwritten. `}
              {summary.blocked > 0 &&
                `${summary.blocked} blocked ${summary.blocked === 1 ? "row" : "rows"} will be skipped.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="muted" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleConfirm()}>
              Import {importableCount}{" "}
              {importableCount === 1 ? "chapter" : "chapters"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
