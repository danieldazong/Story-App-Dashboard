"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ChapterAccess } from "@/types/catalog";

export function ChapterEditorSettingsCard({
  number,
  onNumberChange,
  numberError,
  title,
  onTitleChange,
  titleError,
  access,
  onAccessChange,
  previousHref,
  nextHref,
}: {
  number: number;
  onNumberChange: (value: number) => void;
  numberError?: string;
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  access: ChapterAccess;
  onAccessChange: (value: ChapterAccess) => void;
  previousHref: string | null;
  nextHref: string | null;
}) {
  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="card__header-title">Chapter settings</h2>

      <div className="field-group">
        <label className="field-group__label" htmlFor="chapter-editor-number">
          Chapter number
        </label>
        <Input
          id="chapter-editor-number"
          type="number"
          value={number}
          onChange={(event) => onNumberChange(Number(event.target.value))}
        />
        {numberError && (
          <p className="field-group__helper field-group__helper--error">
            {numberError}
          </p>
        )}
      </div>

      <div className="field-group">
        <label className="field-group__label" htmlFor="chapter-editor-title">
          Title
        </label>
        <Input
          id="chapter-editor-title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
        />
        {titleError && (
          <p className="field-group__helper field-group__helper--error">
            {titleError}
          </p>
        )}
      </div>

      <div className="field-group">
        <span className="field-group__label">Access</span>
        <SegmentedControl
          value={access}
          onChange={(value) => onAccessChange(value as ChapterAccess)}
          options={[
            { value: "free", label: "Free" },
            { value: "locked", label: "Locked" },
          ]}
          aria-label="Access"
        />
        <p className="field-group__helper">
          Locked chapters need an ad view or a subscription.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        {previousHref ? (
          <Button variant="outline" size="icon" asChild>
            <Link href={previousHref} aria-label="Previous chapter">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label="Previous chapter">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {nextHref ? (
          <Button variant="outline" size="icon" asChild>
            <Link href={nextHref} aria-label="Next chapter">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label="Next chapter">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
