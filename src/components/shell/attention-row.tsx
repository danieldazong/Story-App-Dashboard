"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { MissingAsset } from "@/types/catalog";

const MISSING_LABEL: Record<MissingAsset, string> = {
  script: "Script",
  audio: "Narration audio",
  both: "Script and audio",
};

export function AttentionRow({
  bookTitle,
  chapterNumber,
  chapterTitle,
  missing,
  href,
}: {
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  missing: MissingAsset;
  href: string;
}) {
  const router = useRouter();

  return (
    <TableRow
      onClick={() => router.push(href)}
      className="cursor-pointer"
    >
      <TableCell className="text-text">{bookTitle}</TableCell>
      <TableCell>
        Chapter {String(chapterNumber).padStart(2, "0")} · {chapterTitle}
      </TableCell>
      <TableCell className="text-muted">{MISSING_LABEL[missing]}</TableCell>
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
