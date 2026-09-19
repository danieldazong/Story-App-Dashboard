"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
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
import { BookCoverThumbnail } from "@/components/books/book-cover-thumbnail";
import { DeleteBookDialog } from "@/components/books/delete-book-dialog";
import type { BookListRow } from "@/lib/queries";

const columnHelper = createColumnHelper<BookListRow>();

function RatioCell({
  ready,
  total,
  complete,
}: {
  ready: number;
  total: number;
  complete?: boolean;
}) {
  return (
    <span className="font-mono text-mono">
      <span className={complete === undefined ? "text-text" : complete ? "text-status-ok" : "text-status-warn"}>
        {ready}
      </span>
      <span className="text-muted"> / {total}</span>
    </span>
  );
}

export function BooksTable({ rows }: { rows: BookListRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BookListRow | null>(null);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "cover",
        header: "Cover",
        cell: ({ row }) => (
          <BookCoverThumbnail
            cover={row.original.book.cover}
            alt={`Cover for ${row.original.book.title}`}
          />
        ),
      }),
      columnHelper.accessor((row) => row.book.title, {
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="text-body text-text">{row.original.book.title}</span>
        ),
      }),
      columnHelper.display({
        id: "chapters",
        header: "Chapters",
        cell: ({ row }) => (
          <RatioCell
            ready={row.original.chapters.ready}
            total={row.original.chapters.total}
          />
        ),
      }),
      columnHelper.display({
        id: "audio",
        header: "Audio",
        cell: ({ row }) => (
          <RatioCell
            ready={row.original.audio.ready}
            total={row.original.audio.total}
            complete={row.original.audio.ready === row.original.audio.total}
          />
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const bookId = row.original.book.id;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="muted"
                    size="icon"
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Actions for ${row.original.book.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  collisionPadding={16}
                  avoidCollisions
                >
                  <DropdownMenuItem onClick={() => router.push(`/books/${bookId}`)}>
                    Open
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingDelete(row.original);
                    }}
                  >
                    Delete book
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }),
    ],
    [router],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      globalFilter: search,
    },
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _columnId, filterValue) => {
      const title = row.original.book.title.toLowerCase();
      return title.includes(String(filterValue).toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const visibleRows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search stories by title..."
          className="pl-9"
          aria-label="Search stories by title"
        />
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="flex flex-col gap-3 p-6">
            <p className="text-body text-text">No stories yet</p>
            <p className="card__sub-line">
              Create a story to start tracking scripts and narration audio.
            </p>
            <div>
              <Button asChild variant="outline">
                <Link href="/books/new">New Story</Link>
              </Button>
            </div>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col gap-3 p-6">
            <p className="text-body text-text">
              No stories match &quot;{search}&quot;
            </p>
            <p className="card__sub-line">
              Try a different title, or clear the search to see every story.
            </p>
            <div>
              <Button variant="muted" size="sm" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
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
                {visibleRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/books/${row.original.book.id}`)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="text-helper text-muted">
        {rows.length} {rows.length === 1 ? "story" : "stories"}
      </p>

      {pendingDelete && (
        <DeleteBookDialog
          bookId={pendingDelete.book.id}
          bookTitle={pendingDelete.book.title}
          chapterCount={pendingDelete.chapters.total}
          open
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}
