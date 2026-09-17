"use client";

import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { ChapterAccess } from "@/types/catalog";

export function ChapterSettingsCard({
  number,
  onNumberChange,
  numberError,
  title,
  onTitleChange,
  titleError,
  access,
  onAccessChange,
  disabled = false,
  idPrefix,
  titleInputRef,
}: {
  number: number;
  onNumberChange: (value: number) => void;
  numberError?: string;
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  access: ChapterAccess;
  onAccessChange: (value: ChapterAccess) => void;
  disabled?: boolean;
  idPrefix: string;
  titleInputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="card__header-title">Chapter settings</h2>

      <div className="field-group">
        <label className="field-group__label" htmlFor={`${idPrefix}-number`}>
          Chapter number
        </label>
        <Input
          id={`${idPrefix}-number`}
          type="number"
          value={number}
          disabled={disabled}
          onChange={(event) => onNumberChange(Number(event.target.value))}
        />
        {numberError && (
          <p className="field-group__helper field-group__helper--error">
            {numberError}
          </p>
        )}
      </div>

      <div className="field-group">
        <label className="field-group__label" htmlFor={`${idPrefix}-title`}>
          Title
        </label>
        <Input
          id={`${idPrefix}-title`}
          ref={titleInputRef}
          value={title}
          disabled={disabled}
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
          disabled={disabled}
          aria-label="Access"
        />
        <p className="field-group__helper">
          Locked chapters need an ad view or a subscription.
        </p>
      </div>
    </div>
  );
}
