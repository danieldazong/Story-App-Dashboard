"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
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
import type { BookDetailsValues } from "@/components/books/book-details-form";
import type { BookStatus } from "@/types/catalog";

export type CreateBookDialogHandle = {
  open: () => void;
};

export const CreateBookDialog = forwardRef<CreateBookDialogHandle, object>(
  function CreateBookDialog(_props, ref) {
    const [open, setOpen] = useState(false);
    const form = useFormContext<BookDetailsValues>();

    useImperativeHandle(ref, () => ({
      open: () => setOpen(true),
    }));

    function handleChoice(status: BookStatus) {
      // No server action exists yet (Clerk/Supabase land in prompts 11-18).
      // Stay on this screen rather than fabricating a new book id.
      form.setValue("status", status, { shouldDirty: true });
      toast.success(
        `Validated as ${status === "draft" ? "a draft" : "published"}. Story creation isn't wired to a backend yet — nothing was saved.`,
      );
      setOpen(false);
    }

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create story</DialogTitle>
            <DialogDescription>
              Save it as a draft to keep working, or publish it now so
              it&apos;s visible in reader clients.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="muted" onClick={() => handleChoice("draft")}>
              Save as draft
            </Button>
            <Button onClick={() => handleChoice("published")}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
