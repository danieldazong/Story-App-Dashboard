"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createChapter } from "@/app/actions/chapters";
import { extractDocxText } from "@/lib/docx";
import {
  manuscriptSectionWordCount,
  splitManuscript,
  type ManuscriptSection,
} from "@/lib/manuscript";

type ManuscriptFile = {
  name: string;
  sizeBytes: number;
};

type ManuscriptState =
  | { status: "empty" }
  | { status: "extracting"; file: ManuscriptFile }
  | { status: "unreadable"; file: ManuscriptFile }
  | { status: "too-few-sections"; file: ManuscriptFile }
  | { status: "preview"; file: ManuscriptFile; sections: ManuscriptSection[] };

const TEXT_EXTENSIONS = [".txt", ".md"];

export type ManuscriptCardHandle = {
  /**
   * How many progress steps flush() will report — one per previewed section,
   * because each is its own sequential createChapter round trip.
   *
   * Called by the Create Story dialog BEFORE the chain starts so the bar's
   * denominator is real. A 9-chapter manuscript genuinely is 9 steps.
   */
  pendingSteps: () => number;
  /**
   * Creates the previewed chapters against a book id supplied by the caller.
   *
   * Used during story creation: the card's own `bookId` prop is still empty at
   * that moment, so the id comes from the freshly-created row instead. Returns
   * silently when there is nothing pending.
   *
   * `report` is called once per chapter actually created.
   */
  flush: (bookId: string, report?: (label: string) => void) => Promise<void>;
};

export const ManuscriptCard = forwardRef<
  ManuscriptCardHandle,
  {
    bookId: string;
    existingNumbers: number[];
    onImport: () => void;
  }
>(function ManuscriptCard({ bookId, existingNumbers, onImport }, ref) {
  const [state, setState] = useState<ManuscriptState>({ status: "empty" });
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In create mode there is no book id yet, so Confirm defers: the split is
  // held and written when Create Story runs (see flush below). The chapters
  // still get a saved parent before they are inserted — the rule holds, the
  // operator just does not have to re-upload after saving.
  const isDeferred = bookId === "";

  function reset() {
    setState({ status: "empty" });
  }

  /** Shared writer so Confirm and flush cannot drift apart. */
  async function createSections(
    targetBookId: string,
    sections: ManuscriptSection[],
    fileName: string,
    startNumber: number,
    report?: (label: string) => void,
  ): Promise<{ created: number; error: string | null }> {
    let nextNumber = startNumber;
    let created = 0;

    // Sequential, not parallel: chapter numbers race for the
    // (book_id, number) unique constraint otherwise. That sequence is exactly
    // why progress is reported per chapter — each one is a separate round trip
    // the operator would otherwise wait through blind.
    for (const section of sections) {
      const result = await createChapter({
        bookId: targetBookId,
        number: nextNumber,
        title: section.title,
        scriptText: section.body,
        scriptFileName: fileName,
      });

      if (!result.ok) {
        return {
          created,
          error:
            created === 0
              ? result.formError
              : `Created ${created} of ${sections.length} chapters, then stopped: ${result.formError}`,
        };
      }

      created += 1;
      nextNumber += 1;
      report?.(`Created chapter ${created} of ${sections.length}`);
    }

    return { created, error: null };
  }

  useImperativeHandle(ref, () => ({
    pendingSteps() {
      return state.status === "preview" ? state.sections.length : 0;
    },
    async flush(newBookId: string, report?: (label: string) => void) {
      if (state.status !== "preview") return;

      const { created, error } = await createSections(
        newBookId,
        state.sections,
        state.file.name,
        existingNumbers.length === 0 ? 1 : Math.max(...existingNumbers) + 1,
        report,
      );

      if (error) {
        toast.error(error);
        return;
      }

      toast.success(
        `Created ${created} ${created === 1 ? "chapter" : "chapters"} from ${state.file.name}.`,
      );
      reset();
    },
  }));

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const fileMeta: ManuscriptFile = { name: file.name, sizeBytes: file.size };
    const name = file.name.toLowerCase();
    const isTextFile = TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
    const isDocx = name.endsWith(".docx");

    if (!isTextFile && !isDocx) {
      setState({ status: "unreadable", file: fileMeta });
      return;
    }

    let text: string;
    try {
      if (isDocx) {
        setState({ status: "extracting", file: fileMeta });
        text = await extractDocxText(file);
      } else {
        text = await file.text();
      }
    } catch {
      setState({ status: "unreadable", file: fileMeta });
      return;
    }

    if (text.trim() === "") {
      setState({ status: "unreadable", file: fileMeta });
      return;
    }

    const { sections } = splitManuscript(text);
    if (sections.length < 2) {
      setState({ status: "too-few-sections", file: fileMeta });
      return;
    }

    setState({ status: "preview", file: fileMeta, sections });
  }

  function handleConfirm() {
    if (state.status !== "preview") return;

    // Create mode: the book does not exist yet, so the preview stays on screen
    // and is written by flush() when Create Story runs. Nothing is lost and
    // nothing is claimed to have happened.
    if (isDeferred) {
      setImportError(null);
      toast.success(
        `${state.sections.length} chapters ready — they'll be created when you press Create Story.`,
      );
      return;
    }

    const sections = state.sections;
    const fileName = state.file.name;
    setImportError(null);

    startTransition(async () => {
      const { created, error } = await createSections(
        bookId,
        sections,
        fileName,
        existingNumbers.length === 0 ? 1 : Math.max(...existingNumbers) + 1,
      );

      if (error) {
        setImportError(error);
        if (created > 0) onImport();
        return;
      }

      toast.success(
        `Created ${created} ${created === 1 ? "chapter" : "chapters"} from ${fileName}.`,
      );
      onImport();
      reset();
    });
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Manuscript</h2>
        <p className="card__sub-line">
          For a whole book in one file — splits it into many chapters at
          once. For a single chapter, use Chapter script below instead.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.txt,.md"
        className="hidden"
        onChange={handleFileChange}
      />

      {state.status === "preview" ? (
        <div className="flex flex-col gap-3">
          <div className="table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chapter #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Words</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.sections.map((section) => (
                  <TableRow key={section.number}>
                    <TableCell className="font-mono text-mono">
                      {String(section.number).padStart(2, "0")}
                    </TableCell>
                    <TableCell>{section.title}</TableCell>
                    <TableCell className="font-mono text-mono">
                      {manuscriptSectionWordCount(section)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          section.confident
                            ? "status-pill status-pill--ok"
                            : "status-pill status-pill--warn"
                        }
                      >
                        {section.confident ? "Detected" : "Guessed"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {importError && (
            <p className="field-group__helper field-group__helper--error">
              {importError}
            </p>
          )}
          {isDeferred && (
            <p className="field-group__helper">
              These chapters are created when you press Create Story.
            </p>
          )}
          <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
            <Button
              variant="muted"
              size="sm"
              disabled={importing}
              onClick={reset}
            >
              Discard
            </Button>
            <Button size="sm" disabled={importing} onClick={handleConfirm}>
              {importing ? "Creating…" : "Confirm"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-[120px] w-full flex-col items-center justify-center gap-3 rounded-input border border-dashed border-border bg-page p-4 text-center">
          {/*
            The picker is rendered once, for every state except `extracting` —
            not repeated inside each branch.

            `unreadable` and `too-few-sections` previously rendered their
            message and nothing else, which left the operator with no control at
            all: the file input is hidden, and the Discard/Confirm row only
            exists in the `preview` branch. A page reload was the only way out.
            Making the button structural rather than per-state means a fourth
            terminal state added later inherits the way out instead of
            reintroducing the dead end — the same rule the other drop zones and
            chapter-script-card already follow.

            `extracting` stays button-free deliberately: it resolves on its own,
            and offering a picker mid-read invites a race between two
            extractions.
          */}
          {state.status === "extracting" ? (
            <p className="text-helper text-muted">
              Reading {state.file.name}…
            </p>
          ) : (
            <>
              <p className="text-helper text-muted">
                {state.status === "unreadable"
                  ? "No readable text found in this file."
                  : state.status === "too-few-sections"
                    ? "No chapter breaks found. Add chapters one at a time in the Chapter script card instead."
                    : "Drop a manuscript file, or choose one"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                {/*
                  After a rejected file the action is a replacement, not a first
                  choice. Re-picking the SAME file works: handleFileChange
                  clears `event.target.value`, so onChange fires again even for
                  an identical selection the operator has since fixed on disk.
                */}
                {state.status === "empty" ? "Choose file" : "Choose another file"}
              </Button>
            </>
          )}
        </div>
      )}

      <p className="field-group__helper">DOCX, TXT or MD · max 10 MB</p>
    </div>
  );
});
