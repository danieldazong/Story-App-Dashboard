"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Check, ChevronRight, MoreHorizontal } from "lucide-react";
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteChapter, updateChapterAccess } from "@/app/actions/chapters";
import { bookAudioProgress, bookChapterProgress, formatDuration } from "@/lib/catalog";
import type { ChapterAccess, ChapterListItem } from "@/types/catalog";

// ChapterListItem, not Chapter: this table renders word counts and presence,
// never chapter prose. See AGENTS.md, Performance Rules.
const columnHelper = createColumnHelper<ChapterListItem>();

export function ChaptersCard({
  bookId,
  chapters,
  onAddChapter,
  onChanged,
}: {
  bookId: string;
  chapters: ChapterListItem[];
  onAddChapter: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<ChapterListItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  // Optimistic access state: a single boolean flip where instant feedback
  // matters while working down a chapter list. Everything else waits for the
  // server. Cleared on refresh, reverted on failure.
  const [optimisticAccess, setOptimisticAccess] = useState<
    Record<string, ChapterAccess>
  >({});

  // Before the book is saved there is no real book id, so a chapter page
  // would have nowhere to route to (`/books//chapters/<n>` — a real 404).
  const canOpenChapter = bookId !== "";

  const scriptProgress = useMemo(() => bookChapterProgress(chapters), [chapters]);
  const audioProgress = useMemo(() => bookAudioProgress(chapters), [chapters]);

  function handleToggleAccess(chapter: ChapterListItem) {
    const current = optimisticAccess[chapter.id] ?? chapter.access;
    const next: ChapterAccess = current === "free" ? "locked" : "free";

    setOptimisticAccess((state) => ({ ...state, [chapter.id]: next }));

    void (async () => {
      const result = await updateChapterAccess(chapter.id, bookId, next);
      if (!result.ok) {
        setOptimisticAccess((state) => ({ ...state, [chapter.id]: current }));
        toast.error(result.formError);
        return;
      }
      toast.success(
        `Chapter ${String(chapter.number).padStart(2, "0")} set to ${next}.`,
      );
      onChanged();
    })();
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor("number", {
        header: "#",
        cell: ({ getValue }) => (
          <span className="font-mono text-mono">
            {String(getValue()).padStart(2, "0")}
          </span>
        ),
      }),
      columnHelper.accessor("title", {
        header: "Title",
        cell: ({ getValue }) => <span className="text-text">{getValue()}</span>,
      }),
      columnHelper.display({
        id: "text",
        header: "Text",
        cell: ({ row }) => {
          const chapter = row.original;
          if (chapter.script.state === "ready") {
            return (
              <span className="inline-flex items-center gap-1.5 font-mono text-mono">
                {chapter.script.wordCount.toLocaleString()} words
                <Check className="h-3.5 w-3.5 text-status-ok" />
              </span>
            );
          }
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={!canOpenChapter}
              onClick={(event) => {
                event.stopPropagation();
                router.push(`/books/${bookId}/chapters/${chapter.number}`);
              }}
            >
              + Upload text
            </Button>
          );
        },
      }),
      columnHelper.display({
        id: "audio",
        header: "Audio",
        cell: ({ row }) => {
          const chapter = row.original;
          if (chapter.audio.state === "ready") {
            // A null duration means narration exists but was never measured.
            // The check still shows — the audio IS present — but the column
            // says so rather than printing a fabricated 0:00.
            return (
              <span className="inline-flex items-center gap-1.5 font-mono text-mono">
                {chapter.audio.durationSeconds === null
                  ? "—"
                  : formatDuration(chapter.audio.durationSeconds)}
                <Check className="h-3.5 w-3.5 text-status-ok" />
              </span>
            );
          }
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={!canOpenChapter}
              onClick={(event) => {
                event.stopPropagation();
                router.push(`/books/${bookId}/chapters/${chapter.number}`);
              }}
            >
              + Upload audio
            </Button>
          );
        },
      }),
      columnHelper.accessor("access", {
        header: "Access",
        cell: ({ row }) => {
          const access = optimisticAccess[row.original.id] ?? row.original.access;
          return (
            <span
              className={
                access === "free"
                  ? "status-pill status-pill--ok"
                  : "status-pill status-pill--warn"
              }
            >
              {access === "free" ? "Free" : "Locked"}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const chapter = row.original;
          const href = `/books/${bookId}/chapters/${chapter.number}`;
          const access = optimisticAccess[chapter.id] ?? chapter.access;
          return (
            <div className="flex items-center justify-end gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="muted"
                    size="icon"
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Actions for chapter ${chapter.number}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  collisionPadding={16}
                  avoidCollisions
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenuItem
                    disabled={!canOpenChapter}
                    onClick={() => router.push(href)}
                  >
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleAccess(chapter);
                    }}
                  >
                    {access === "free" ? "Set locked" : "Set free"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteError(null);
                      setPendingDelete(chapter);
                    }}
                  >
                    Delete chapter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </div>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookId, router, canOpenChapter, optimisticAccess],
  );

  const table = useReactTable({
    data: chapters,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="card">
      <div className="flex flex-col gap-1 p-6 pb-4">
        <div className="card__header">
          <h2 className="card__header-title">Chapters</h2>
          <div className="card__header-actions">
            <Button variant="outline" size="sm" onClick={onAddChapter}>
              Add chapter
            </Button>
          </div>
        </div>
        {/*
          The production state of the whole book, in one line. This was muted
          helper text at the bottom-right of the header — the most useful
          information on the page, in its least prominent position. An
          incomplete count now carries a warn pill so an unfinished book reads
          at a glance instead of requiring a scan down the rows.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-helper text-muted">
            {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"}
          </span>
          <span
            className={
              scriptProgress.ready === scriptProgress.total
                ? "status-pill status-pill--ok"
                : "status-pill status-pill--warn"
            }
          >
            {scriptProgress.ready} of {scriptProgress.total} with text
          </span>
          <span
            className={
              audioProgress.ready === audioProgress.total
                ? "status-pill status-pill--ok"
                : "status-pill status-pill--warn"
            }
          >
            {audioProgress.ready} of {audioProgress.total} with narration
          </span>
        </div>
      </div>

      {chapters.length === 0 ? (
        <div className="flex flex-col gap-3 p-6">
          <p className="text-body text-text">No chapters yet</p>
          <p className="card__sub-line">
            Add a chapter or import a folder of scripts to get started.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onAddChapter}>
              Add chapter
            </Button>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-16" />
              <col className="w-auto" />
              <col className="w-40" />
              <col className="w-40" />
              <col className="w-28" />
              <col className="w-24" />
            </colgroup>
            <TableHeader className="sticky top-0 z-10 bg-card">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        header.column.id === "actions" ? "text-right" : ""
                      }
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={canOpenChapter ? "cursor-pointer" : undefined}
                  onClick={
                    canOpenChapter
                      ? () =>
                          router.push(
                            `/books/${bookId}/chapters/${row.original.number}`,
                          )
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (deleting) return;
          if (!open) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chapter?</DialogTitle>
            <DialogDescription>
              {pendingDelete &&
                `Chapter ${String(pendingDelete.number).padStart(2, "0")} — ${pendingDelete.title} will be removed, along with its script text and its narration audio reference. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="field-group__helper field-group__helper--error">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="muted"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                if (!pendingDelete) return;
                setDeleteError(null);
                startDeleting(async () => {
                  const result = await deleteChapter(pendingDelete.id, bookId);
                  if (!result.ok) {
                    setDeleteError(result.formError);
                    return;
                  }
                  toast.success(
                    `Chapter ${String(pendingDelete.number).padStart(2, "0")} deleted.`,
                  );
                  setPendingDelete(null);
                  onChanged();
                });
              }}
            >
              {deleting ? "Deleting…" : "Delete chapter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
