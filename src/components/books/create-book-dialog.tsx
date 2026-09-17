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

export const CreateBookDialog = forwardRef<
  CreateBookDialogHandle,
  {
    /**
     * Called with the new book id after the row exists but before navigation,
     * so pending work composed during creation can be saved against it.
     */
    onCreated?: (bookId: string) => Promise<void>;
  }
>(function CreateBookDialog({ onCreated }, ref) {
    const [open, setOpen] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [pending, setSaving] = useState(false);
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
        setFormError(result.formError);
        for (const [field, message] of Object.entries(
          result.fieldErrors ?? {},
        )) {
          form.setError(field as keyof BookDetailsValues, { message });
        }
        return;
      }

      // Hand the new book id to whatever is holding unsaved work (a manuscript
      // preview, a composed chapter) so it can be flushed before navigating.
      await onCreated?.(result.data.id);

      toast.success(
        status === "draft" ? "Story saved as a draft." : "Story published.",
      );
      setSaving(false);
      setOpen(false);
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

          <DialogFooter>
            <Button
              variant="muted"
              disabled={pending}
              onClick={() => handleChoice("draft")}
            >
              {pending ? "Saving…" : "Save as draft"}
            </Button>
            <Button disabled={pending} onClick={() => handleChoice("published")}>
              {pending ? "Saving…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
