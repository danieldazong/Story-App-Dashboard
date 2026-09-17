"use client";

import { cn } from "@/lib/utils";

export type SegmentedControlOption = {
  value: string;
  label: string;
};

export function SegmentedControl({
  value,
  onChange,
  options,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SegmentedControlOption[];
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="segmented-control w-fit"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "segmented-control__option",
              selected
                ? "segmented-control__option--selected"
                : "segmented-control__option--unselected",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
