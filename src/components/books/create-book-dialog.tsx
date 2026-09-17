"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createBook } from "@/app/actions/books";
import type { BookDetailsValues } from "@/components/books/book-details-form";
import type { BookStatus } from "@/types/catalog";

export type CreateBookDialogHandle = {
  open: () => void;
};

/** Progress while the create-and-flush chain runs. */
type Progress = { done: number; total: number; label: string };

export const CreateBookDialog = forwardRef<
  CreateBookDialogHandle,
  {
    /**
     * Called with the new book id after the row exists but before navigation,
     * so pending work composed during creation can be saved against it.
     *
     * `report` advances the progress bar by one step; call it once per unit of
     * work actually completed, with a label naming it.
     */
    onCreated?: (
      bookId: string,
      report: (label: string) => void,
    ) => Promise<void>;
    /**
     * How many steps `onCreated` will report, counted BEFORE anything runs.
     *
     * The bar's denominator comes from here rather than being estimated, which
     * is what makes "4 of 12" a fact instead of a guess.
     */
    pendingSteps?: () => number;
  }
>(function CreateBookDialog({ onCreated, pendingSteps }, ref) {
    const [open, setOpen] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [pending, setSaving] = useState(false);
    const [progress, setProgress] = useState<Progress | null>(null);
    const form = useFormContext<BookDetailsValues>();
    const router = useRouter();

    useImperativeHandle(ref, () => ({
      open: () => {
        setFormError(null);
        setOpen(true);
      },
    }));

    async function handleChoice(status: BookStatus) {
      const values = form.getValues();
      setFormError(null);
      setSaving(true);

      // Counted up front: 1 for the book row itself, plus whatever the cover,
      // manuscript and composer say they are holding. Creating a story with a
      // 9-chapter manuscript is ~11 sequential round trips at roughly a second
      // each — the wait this bar exists to make legible.
      const total = 1 + (pendingSteps?.() ?? 0);
      let done = 0;
      setProgress({ done: 0, total, label: "Creating story…" });

      const advance = (label: string) => {
        done += 1;
        setProgress({ done, total, label });
      };

      const result = await createBook({
        title: values.title,
        author: values.author,
        shortDescription: values.shortDescription,
        synopsis: values.synopsis,
        genres: values.genres,
        maturity: values.maturity,
        status,
        defaultChapterAccess: values.defaultChapterAccess,
      });

      if (!result.ok) {
        setSaving(false);
        setProgress(null);
        setFormError(result.formError);
        for (const [field, message] of Object.entries(
          result.fieldErrors ?? {},
        )) {
          form.setError(field as keyof BookDetailsValues, { message });
        }
        return;
      }

      advance(status === "draft" ? "Draft created" : "Story created");

      // Hand the new book id to whatever is holding unsaved work (a manuscript
      // preview, a composed chapter) so it can be flushed before navigating.
      await onCreated?.(result.data.id, advance);

      // Held at 100% with a final label rather than vanishing: the navigation
      // below takes a moment on its own, and a bar that disappears at 99% reads
      // as a failure.
      setProgress({ done: total, total, label: "Opening story…" });

      toast.success(
        status === "draft" ? "Story saved as a draft." : "Story published.",
      );
      setSaving(false);
      setOpen(false);
      setProgress(null);
      router.push(`/books/${result.data.id}`);
    }

    return (
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create story</DialogTitle>
            <DialogDescription>
              Save it as a draft to keep working, or publish it now so
              it&apos;s visible in reader clients.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <p className="field-group__helper field-group__helper--error">
              {formError}
            </p>
          )}

          {/*
            Step-counted, never estimated. The denominator is collected from the
            cards before any work starts, and the numerator only moves when a
            round trip has actually completed — so the count is a report of what
            happened, not a prediction. Same bar markup as the cover upload's.
          */}
          {progress && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-helper text-muted">{progress.label}</span>
                <span className="font-mono text-mono text-muted">
                  {progress.done} of {progress.total}
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label="Story creation progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {/*
              The buttons keep their own labels while work runs, rather than
              both switching to "Saving…". Two buttons reading "Saving…" at once
              looked like both actions had fired; and now that the bar above
              names the current step and counts it, repeating a vaguer version
              of the same thing twice adds nothing. Disabled state already shows
              that something is in progress.
            */}
            <Button
              variant="muted"
              disabled={pending}
              onClick={() => handleChoice("draft")}
            >
              Save as draft
            </Button>
            <Button disabled={pending} onClick={() => handleChoice("published")}>
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
