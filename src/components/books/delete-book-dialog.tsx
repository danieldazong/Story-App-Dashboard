"use client";

import { useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteBook } from "@/app/actions/books";

/**
 * Deleting a book cascades away every chapter in it. A 148-chapter serial
 * disappearing behind one click deserves more friction than a yes/no, so the
 * operator types the title to enable confirm.
 */
export function DeleteBookDialog({
  bookId,
  bookTitle,
  chapterCount,
  open,
  onOpenChange,
}: {
  bookId: string;
  bookTitle: string;
  chapterCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canConfirm = typed.trim() === bookTitle && !pending;

  function handleOpenChange(next: boolean) {
    if (pending) return;
    onOpenChange(next);
    if (!next) {
      setTyped("");
      setFormError(null);
    }
  }

  function handleDelete() {
    setFormError(null);
    startTransition(async () => {
      const result = await deleteBook(bookId);
      if (!result.ok) {
        setFormError(result.formError);
        return;
      }
      toast.success(`${bookTitle} deleted.`);
      handleOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this book?</DialogTitle>
          <DialogDescription>
            {bookTitle} and all {chapterCount}{" "}
            {chapterCount === 1 ? "chapter" : "chapters"} in it will be deleted,
            including their script text. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="field-group">
          <Label htmlFor="delete-book-confirm">
            Type the book title to confirm
          </Label>
          <Input
            id="delete-book-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={bookTitle}
            autoComplete="off"
            disabled={pending}
          />
          {formError && (
            <p className="field-group__helper field-group__helper--error">
              {formError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="muted"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={handleDelete}
          >
            {pending ? "Deleting…" : "Delete book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
