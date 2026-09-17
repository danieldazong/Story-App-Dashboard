"use client";

import { useRef, useState } from "react";
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
import { extractDocxText } from "@/lib/docx";
import {
  manuscriptSectionWordCount,
  splitManuscript,
  type ManuscriptSection,
} from "@/lib/manuscript";
import type { Chapter } from "@/types/catalog";

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

export function ManuscriptCard({
  bookId,
  existingNumbers,
  onImport,
}: {
  bookId: string;
  existingNumbers: number[];
  onImport: (chapters: Chapter[]) => void;
}) {
  const [state, setState] = useState<ManuscriptState>({ status: "empty" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setState({ status: "empty" });
  }

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

    let nextNumber =
      existingNumbers.length === 0 ? 1 : Math.max(...existingNumbers) + 1;

    // No server action exists yet (Clerk/Supabase land in prompts 11-18).
    // These chapters are appended to the book editor's local state only —
    // they do not reach mock-catalog.ts and will not survive a page reload.
    const newChapters: Chapter[] = state.sections.map((section) => {
      const number = nextNumber;
      nextNumber += 1;
      return {
        id: `${bookId || "book-draft"}-ch-local-${number}-${Date.now()}`,
        bookId,
        number,
        title: section.title,
        script: {
          state: "ready",
          fileName: state.file.name,
          text: section.body,
          wordCount: manuscriptSectionWordCount(section),
        },
        audio: { state: "missing" },
        access: "locked",
        updatedAt: new Date().toISOString(),
      };
    });

    onImport(newChapters);
    toast.success(
      `Created ${newChapters.length} ${newChapters.length === 1 ? "chapter" : "chapters"} from ${state.file.name}.`,
    );
    reset();
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
          <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
            <Button variant="muted" size="sm" onClick={reset}>
              Discard
            </Button>
            <Button size="sm" onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-[120px] w-full flex-col items-center justify-center gap-3 rounded-input border border-dashed border-border bg-page p-4 text-center">
          {state.status === "extracting" ? (
            <p className="text-helper text-muted">
              Reading {state.file.name}…
            </p>
          ) : state.status === "unreadable" ? (
            <p className="text-helper text-muted">
              No readable text found in this file.
            </p>
          ) : state.status === "too-few-sections" ? (
            <p className="text-helper text-muted">
              No chapter breaks found. Add chapters one at a time in the
              Chapter script card instead.
            </p>
          ) : (
            <>
              <p className="text-helper text-muted">
                Drop a manuscript file, or choose one
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose file
              </Button>
            </>
          )}
        </div>
      )}

      <p className="field-group__helper">DOCX, TXT or MD · max 10 MB</p>
    </div>
  );
}
