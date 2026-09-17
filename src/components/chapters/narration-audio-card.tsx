"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration } from "@/lib/catalog";

export type NarrationAudioPreview = {
  url: string;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number | null;
};

export function NarrationAudioCard({
  preview,
  onFileSelected,
  onRemove,
  acceptedFormats,
  maxSizeMb,
}: {
  preview?: NarrationAudioPreview | null;
  onFileSelected?: (preview: NarrationAudioPreview) => void;
  onRemove?: () => void;
  /**
   * From `app_settings`, never from constants.
   *
   * This card used to read SETTINGS_DEFAULTS directly, so an operator who
   * edited the accepted formats in Settings saw no change here — and the
   * Chapter editor's own card disagreed with both the settings row and the
   * storage bucket. Required rather than optional-with-fallback precisely so
   * the compiler finds every caller instead of letting a stale default survive
   * unnoticed. See AGENTS.md, prompt 16 notes.
   */
  acceptedFormats: string[];
  maxSizeMb: number;
}) {
  const formatsLine = acceptedFormats.join(" or ");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const locked = !onFileSelected;
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onFileSelected) return;

    const url = URL.createObjectURL(file);
    setPendingUrl(url);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      onFileSelected({
        url,
        fileName: file.name,
        sizeBytes: file.size,
        durationSeconds: duration,
      });
      setPendingUrl(null);
    };
    audio.onerror = () => {
      onFileSelected({
        url,
        fileName: file.name,
        sizeBytes: file.size,
        durationSeconds: null,
      });
      setPendingUrl(null);
    };
    audio.src = url;
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="card__header-title">Narration audio</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(",")}
        className="hidden"
        disabled={locked}
        onChange={handleFileChange}
      />

      {preview ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-input border border-border bg-page px-4 py-3">
            <div className="flex flex-col gap-1">
              <p className="font-mono text-mono text-text">
                {preview.fileName}
              </p>
              <p className="font-mono text-mono text-muted">
                {preview.durationSeconds !== null
                  ? formatDuration(preview.durationSeconds)
                  : "Duration unavailable"}{" "}
                · {formatBytes(preview.sizeBytes)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-helper text-muted hover:text-text"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-helper text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-[120px] w-full flex-col items-center justify-center gap-3 rounded-input border border-dashed border-border bg-page p-4 text-center">
          <p className="text-helper text-muted">
            {pendingUrl
              ? "Reading audio…"
              : "Drop a narration file, or choose one"}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={locked || pendingUrl !== null}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file
          </Button>
        </div>
      )}

      <p className="field-group__helper">
        {formatsLine} · max {maxSizeMb} MB
      </p>
    </div>
  );
}
