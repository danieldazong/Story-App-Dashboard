"use client";

import { useRef, useState } from "react";
import { Check, Music, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBytes, formatDuration } from "@/lib/catalog";
import type { AudioAsset } from "@/types/catalog";

const ACCEPTED_AUDIO_FORMATS = [".m4a", ".mp3"];
const MAX_AUDIO_SIZE_MB = 100;

function parseMmSs(value: string): number | null {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function ChapterEditorAudioCard({
  audio,
  onAudioChange,
  onPersistDuration,
  durationPending = false,
}: {
  audio: AudioAsset;
  onAudioChange: (audio: AudioAsset) => void;
  /**
   * Persists a manually-entered duration immediately, independently of the
   * form's Save. This is the fallback for detection reporting Infinity/NaN, so
   * it must work even though audio upload is not implemented yet.
   */
  onPersistDuration?: (seconds: number) => Promise<boolean>;
  durationPending?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState("");
  const [durationError, setDurationError] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = "metadata";
    const finish = (durationSeconds: number) => {
      onAudioChange({
        state: "ready",
        fileName: file.name,
        sizeBytes: file.size,
        durationSeconds,
        durationSource: "detected",
        url,
      });
    };
    probe.onloadedmetadata = () => {
      finish(Number.isFinite(probe.duration) ? probe.duration : 0);
    };
    probe.onerror = () => finish(0);
    probe.src = url;
  }

  function togglePlay() {
    const el = audioElRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => {
        // Fixture URLs aren't real audio; swallow the playback error.
      });
    }
  }

  function openEditDuration() {
    if (audio.state !== "ready") return;
    setDurationInput(formatDuration(audio.durationSeconds));
    setDurationError(null);
    setEditingDuration(true);
  }

  async function saveDuration() {
    if (audio.state !== "ready") return;
    const seconds = parseMmSs(durationInput);
    if (seconds === null) {
      setDurationError("Use mm:ss, e.g. 09:14.");
      return;
    }

    if (onPersistDuration) {
      const saved = await onPersistDuration(seconds);
      if (!saved) {
        setDurationError("Couldn't save the duration. Try again.");
        return;
      }
    }

    onAudioChange({ ...audio, durationSeconds: seconds, durationSource: "manual" });
    setEditingDuration(false);
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="card__header-title">Narration audio</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_AUDIO_FORMATS.join(",")}
        className="hidden"
        onChange={handleFileChange}
      />

      {audio.state === "ready" ? (
        <>
          <audio
            ref={audioElRef}
            src={audio.url}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <Music className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate font-mono text-mono text-text">
                {audio.fileName}
              </span>
            </div>
            <button
              type="button"
              aria-label={playing ? "Pause narration" : "Play narration"}
              onClick={togglePlay}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover"
            >
              {playing ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-mono text-text">
                Duration {formatDuration(audio.durationSeconds)}
              </span>
              {audio.durationSource === "detected" ? (
                <span className="inline-flex items-center gap-1.5 text-helper text-status-ok">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Detected
                </span>
              ) : (
                <span className="text-helper text-muted">Edited</span>
              )}
              <button
                type="button"
                onClick={openEditDuration}
                className="text-helper text-muted hover:text-text"
              >
                Edit duration
              </button>
            </div>
            <p className="font-mono text-mono text-muted">
              Size {formatBytes(audio.sizeBytes)}
            </p>
          </div>

          <div className="flex items-center gap-4 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-helper text-muted hover:text-text"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onAudioChange({ state: "missing" })}
              className="text-helper text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        </>
      ) : (
        <div className="flex h-[120px] w-full flex-col items-center justify-center gap-3 rounded-input border border-dashed border-border bg-page p-4 text-center">
          <p className="text-helper text-muted">
            Drop a narration file, or choose one
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload audio
          </Button>
        </div>
      )}

      <p className="text-helper text-muted">
        Uploads directly to storage · {ACCEPTED_AUDIO_FORMATS.join(" or ")} ·
        max {MAX_AUDIO_SIZE_MB}MB
      </p>

      <Dialog open={editingDuration} onOpenChange={setEditingDuration}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit duration</DialogTitle>
          </DialogHeader>
          <div className="field-group">
            <label className="field-group__label" htmlFor="duration-input">
              Duration (mm:ss)
            </label>
            <Input
              id="duration-input"
              value={durationInput}
              onChange={(event) => setDurationInput(event.target.value)}
              placeholder="09:14"
            />
            {durationError && (
              <p className="field-group__helper field-group__helper--error">
                {durationError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="muted"
              disabled={durationPending}
              onClick={() => setEditingDuration(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={durationPending}
              onClick={saveDuration}
            >
              {durationPending ? "Saving…" : "Save duration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
