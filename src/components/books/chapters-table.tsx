"use client";

import { useMemo, useState } from "react";
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
import { bookAudioProgress, bookChapterProgress, formatDuration } from "@/lib/catalog";
import type { Chapter } from "@/types/catalog";

const columnHelper = createColumnHelper<Chapter>();

export function ChaptersCard({
  bookId,
  chapters,
  onAddChapter,
  onToggleAccess,
  onDeleteChapter,
}: {
  bookId: string;
  chapters: Chapter[];
  onAddChapter: () => void;
  onToggleAccess: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
}) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<Chapter | null>(null);

  // Before the book is saved there is no real book id, so a chapter page
  // would have nowhere to route to (`/books//chapters/<n>` — a real 404).
  // Every navigation surface below is suppressed in that state instead.
  const canOpenChapter = bookId !== "";

  const scriptProgress = useMemo(() => bookChapterProgress(chapters), [chapters]);
  const audioProgress = useMemo(() => bookAudioProgress(chapters), [chapters]);

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
            return (
              <span className="inline-flex items-center gap-1.5 font-mono text-mono">
                {formatDuration(chapter.audio.durationSeconds)}
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
        cell: ({ getValue }) => {
          const access = getValue();
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
                      onToggleAccess(chapter.id);
                      toast.success(
                        `Chapter ${String(chapter.number).padStart(2, "0")} set to ${
                          chapter.access === "free" ? "locked" : "free"
                        }.`,
                      );
                    }}
                  >
                    {chapter.access === "free" ? "Set locked" : "Set free"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
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
    [bookId, router, onToggleAccess, canOpenChapter],
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
        <p className="self-end text-helper text-muted">
          {chapters.length} {chapters.length === 1 ? "chapter" : "chapters"} ·{" "}
          {scriptProgress.ready} with text · {audioProgress.ready} with
          narration
        </p>
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
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chapter?</DialogTitle>
            <DialogDescription>
              {pendingDelete &&
                `Chapter ${String(pendingDelete.number).padStart(2, "0")} — ${pendingDelete.title} will be removed. This can't be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="muted" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                onDeleteChapter(pendingDelete.id);
                toast.success(
                  `Chapter ${String(pendingDelete.number).padStart(2, "0")} deleted.`,
                );
                setPendingDelete(null);
              }}
            >
              Delete chapter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
