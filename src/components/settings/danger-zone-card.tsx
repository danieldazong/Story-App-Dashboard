"use client";

import { useState } from "react";
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

const CONFIRM_PHRASE = "delete seed data";

export function DangerZoneCard() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const canConfirm = confirmText.trim() === CONFIRM_PHRASE;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmText("");
  }

  function handleConfirm() {
    // Nothing is deleted — there is no backend yet (prompts 11-18).
    toast.success(
      "Validated. Seed deletion isn't wired to a backend yet — nothing was removed.",
    );
    handleOpenChange(false);
  }

  return (
    <div className="card flex flex-col gap-4 border-destructive p-6">
      <div>
        <h2 className="card__header-title text-destructive">Danger zone</h2>
      </div>

      <div className="flex items-center justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-body text-text">Delete all seed data</p>
          <p className="card__sub-line">
            Removes test books, chapters and uploaded files. Cannot be undone.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          className="whitespace-nowrap"
          onClick={() => setOpen(true)}
        >
          Delete seed data
        </Button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all seed data?</DialogTitle>
            <DialogDescription>
              This removes every test book, chapter and uploaded file. It cannot
              be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="field-group">
            <Label htmlFor="danger-confirm">
              Type <span className="font-mono text-mono">{CONFIRM_PHRASE}</span>{" "}
              to confirm
            </Label>
            <Input
              id="danger-confirm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button variant="muted" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              Delete seed data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
