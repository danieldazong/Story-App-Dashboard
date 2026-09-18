"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { MissingAsset } from "@/types/catalog";

/**
 * What is missing, as a labelled pill.
 *
 * `both` is destructive rather than warn because a chapter with neither script
 * nor audio is not partially done — it is not started, and it needs two pieces
 * of work rather than one. The distinction is carried by the label as well as
 * the colour; status is never colour alone (AGENTS.md, Design System).
 */
const MISSING_PILL: Record<
  MissingAsset,
  { label: string; className: string }
> = {
  script: { label: "Script", className: "status-pill--warn" },
  audio: { label: "Narration", className: "status-pill--warn" },
  both: { label: "Script and audio", className: "status-pill--destructive" },
};

export function AttentionRow({
  chapterNumber,
  chapterTitle,
  missing,
  href,
}: {
  chapterNumber: number;
  chapterTitle: string;
  missing: MissingAsset;
  href: string;
}) {
  const router = useRouter();
  const pill = MISSING_PILL[missing];

  return (
    <TableRow onClick={() => router.push(href)} className="h-12 cursor-pointer">
      {/*
        `max-w-0` is what makes `truncate` work inside a table cell. Without it
        the cell sizes to its content and a long title widens the column instead
        of ellipsing — the row then grows past 48px, which is the overflow this
        column had. `title` keeps the full text reachable on hover.
      */}
      <TableCell className="max-w-0 text-text">
        <div className="truncate" title={chapterTitle}>
          <span className="font-mono text-mono text-muted">
            {String(chapterNumber).padStart(2, "0")}
          </span>{" "}
          {chapterTitle}
        </div>
      </TableCell>
      <TableCell>
        <span className={`status-pill ${pill.className} w-fit`}>
          {pill.label}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="muted"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            router.push(href);
          }}
        >
          Open
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * The story name, once, above its chapters.
 *
 * Replaces a Book column that repeated the same title on every row. With the
 * queue sorted by story then chapter number, the name is redundant on all but
 * the first row of each run — and a column of repeats costs horizontal space
 * the chapter title needed (§7.4).
 */
export function AttentionGroupHeader({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={3} className="bg-page py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-section-label text-muted">{title}</span>
          <span className="text-helper text-muted">
            {count} {count === 1 ? "chapter" : "chapters"}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}
