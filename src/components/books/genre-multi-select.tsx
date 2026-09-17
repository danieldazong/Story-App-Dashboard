"use client";

import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Genre } from "@/data/genres";

export function GenreMultiSelect({
  value,
  onChange,
  genres,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  genres: readonly Genre[];
}) {
  const labelFor = (genreValue: string) =>
    genres.find((g) => g.value === genreValue)?.label ?? genreValue;

  const available = genres.filter((g) => !value.includes(g.value));

  function removeGenre(genreValue: string) {
    onChange(value.filter((v) => v !== genreValue));
  }

  function addGenre(genreValue: string) {
    if (!value.includes(genreValue)) {
      onChange([...value, genreValue]);
    }
  }

  return (
    <div className="flex min-h-input flex-wrap items-center gap-2 rounded-input border border-border bg-card px-3 py-2">
      {value.map((genreValue) => (
        <span
          key={genreValue}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2.5 py-1 text-helper text-text"
        >
          {labelFor(genreValue)}
          <button
            type="button"
            onClick={() => removeGenre(genreValue)}
            aria-label={`Remove ${labelFor(genreValue)}`}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {available.length > 0 && (
        <Select onValueChange={addGenre} value="">
          <SelectTrigger className="h-7 w-auto min-w-[8rem] border-0 bg-transparent px-2 text-helper">
            <SelectValue placeholder="Add genre..." />
          </SelectTrigger>
          <SelectContent>
            {available.map((genre) => (
              <SelectItem key={genre.value} value={genre.value}>
                {genre.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
