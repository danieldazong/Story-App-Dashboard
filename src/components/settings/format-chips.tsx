"use client";

import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Removable mono format tags with an inline add affordance. Mirrors the
 * Genres control on the Book editor (components/books/genre-multi-select.tsx)
 * rather than introducing a second chip pattern.
 */
export function FormatChips({
  value,
  onChange,
  selectable,
  label,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  selectable: readonly string[];
  label: string;
}) {
  const available = selectable.filter((format) => !value.includes(format));

  function removeFormat(format: string) {
    onChange(value.filter((entry) => entry !== format));
  }

  function addFormat(format: string) {
    if (!value.includes(format)) {
      onChange([...value, format]);
    }
  }

  return (
    <div className="flex min-h-input flex-wrap items-center gap-2 rounded-input border border-border bg-card px-3 py-2">
      {value.map((format) => (
        <span
          key={format}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-page px-2.5 py-1 font-mono text-mono text-text"
        >
          {format}
          <button
            type="button"
            onClick={() => removeFormat(format)}
            aria-label={`Remove ${format}`}
            className="text-muted hover:text-text"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {available.length > 0 && (
        <Select onValueChange={addFormat} value="">
          <SelectTrigger
            className="h-7 w-auto min-w-[8rem] border-0 bg-transparent px-2 text-helper"
            aria-label={`Add ${label}`}
          >
            <SelectValue placeholder="+ Add format" />
          </SelectTrigger>
          <SelectContent>
            {available.map((format) => (
              <SelectItem key={format} value={format}>
                {format}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
