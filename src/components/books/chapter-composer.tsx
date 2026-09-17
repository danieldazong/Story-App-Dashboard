"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ChapterScriptCard } from "@/components/chapters/chapter-script-card";
import {
  NarrationAudioCard,
  type NarrationAudioPreview,
} from "@/components/chapters/narration-audio-card";
import { ChapterSettingsCard } from "@/components/chapters/chapter-settings-card";
import { createChapter } from "@/app/actions/chapters";
import { cn } from "@/lib/utils";
import type { ChapterAccess } from "@/types/catalog";

const composerSchema = z.object({
  number: z.number().int().min(1, "Chapter number must be at least 1"),
  title: z.string().min(1, "Title is required"),
  access: z.enum(["free", "locked"]),
  scriptText: z.string().optional(),
});

type ComposerValues = z.infer<typeof composerSchema>;

export type ChapterComposerHandle = {
  focusTitle: () => void;
  /**
   * How many progress steps flush() will report — 1 when a chapter is composed,
   * 0 when the form is untouched.
   *
   * Uses the same "is there a title?" test as flush() itself, so the count the
   * progress bar promises and the work actually done cannot disagree.
   */
  pendingSteps: () => number;
  /**
   * Creates the chapter currently composed, against a book id supplied by the
   * caller.
   *
   * Used during story creation: the composer's own `bookId` prop is still empty
   * at that moment, so the id comes from the freshly-created row instead.
   * Returns silently when the form is empty or invalid.
   *
   * `report` is called once when the chapter has been created.
   */
  flush: (bookId: string, report?: (label: string) => void) => Promise<void>;
};

export const ChapterComposer = forwardRef<
  ChapterComposerHandle,
  {
    bookId: string;
    nextNumber: number;
    defaultAccess: ChapterAccess;
    existingNumbers: number[];
    onCreate: () => void;
    /** From app_settings, for the Narration card's constraint line. */
    acceptedAudioFormats: string[];
    maxAudioSizeMb: number;
    /** From app_settings, for the Chapter script card. */
    acceptedScriptFormats: string[];
  }
>(function ChapterComposer(
  {
    bookId,
    nextNumber,
    defaultAccess,
    existingNumbers,
    onCreate,
    acceptedAudioFormats,
    maxAudioSizeMb,
    acceptedScriptFormats,
  },
  ref,
) {
  const [numberTaken, setNumberTaken] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [audioPreview, setAudioPreview] =
    useState<NarrationAudioPreview | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ComposerValues>({
    resolver: zodResolver(composerSchema),
    defaultValues: {
      number: nextNumber,
      title: "",
      access: defaultAccess,
      scriptText: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (!form.formState.dirtyFields.access) {
      form.setValue("access", defaultAccess);
    }
    // Mirrors the book's Default chapter access live until the operator
    // touches Access directly — matches the field's "default" semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAccess]);

  useImperativeHandle(ref, () => ({
    focusTitle() {
      containerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      titleInputRef.current?.focus();
      setHighlighted(true);
    },
    pendingSteps() {
      return form.getValues().title.trim() ? 1 : 0;
    },
    async flush(newBookId: string, report?: (label: string) => void) {
      const values = form.getValues();
      // Nothing composed: an untitled, empty form is not pending work.
      if (!values.title.trim()) return;

      const text = values.scriptText?.trim() ?? "";
      const result = await createChapter({
        bookId: newBookId,
        number: values.number,
        title: values.title,
        access: values.access,
        scriptText: text,
        scriptFileName: text === "" ? null : (scriptFileName ?? "Pasted text"),
      });

      if (!result.ok) {
        toast.error(result.formError);
        // Still reported: the step is over, and a bar frozen on a failed step
        // is indistinguishable from one that hung.
        report?.("Chapter created");
        return;
      }

      toast.success(
        `Chapter ${String(result.data.number).padStart(2, "0")} created.`,
      );
      report?.(`Chapter ${String(result.data.number).padStart(2, "0")} created`);
      form.reset({
        number: result.data.number + 1,
        title: "",
        access: defaultAccess,
        scriptText: "",
      });
      setScriptFileName(null);
      setAudioPreview(null);
    },
  }));

  const { title, access, number, scriptText } = form.watch();

  function onSubmit(values: ComposerValues) {
    if (existingNumbers.includes(values.number)) {
      setNumberTaken(values.number);
      form.setError("number", {
        message: `Chapter ${values.number} already exists.`,
      });
      return;
    }
    setNumberTaken(null);
    setFormError(null);

    const text = values.scriptText?.trim() ?? "";

    // Create mode: the book does not exist yet, so the composed chapter stays
    // on screen and is written by flush() when Create Story runs. Nothing is
    // lost, and nothing claims to have been saved.
    if (bookId === "") {
      toast.success(
        `Chapter ${String(values.number).padStart(2, "0")} ready — it'll be created when you press Create Story.`,
      );
      return;
    }

    startTransition(async () => {
      const result = await createChapter({
        bookId,
        number: values.number,
        title: values.title,
        access: values.access,
        scriptText: text,
        scriptFileName: text === "" ? null : (scriptFileName ?? "Pasted text"),
      });

      if (!result.ok) {
        setFormError(result.formError);
        const numberError = result.fieldErrors?.number;
        if (numberError) {
          setNumberTaken(values.number);
          form.setError("number", { message: numberError });
        }
        return;
      }

      // The narration preview is deliberately not carried over: audio upload
      // lands in prompt 16, so there is no storage path to persist yet.
      toast.success(`Chapter ${String(result.data.number).padStart(2, "0")} created.`);
      onCreate();

      form.reset({
        number: result.data.number + 1,
        title: "",
        access: defaultAccess,
        scriptText: "",
      });
      setScriptFileName(null);
      setAudioPreview(null);
    });
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid grid-cols-3 gap-6 rounded-input p-1 outline outline-1 outline-offset-4 transition-colors",
        highlighted ? "outline-primary" : "outline-transparent",
      )}
      onFocusCapture={() => setHighlighted(false)}
      onClickCapture={() => setHighlighted(false)}
    >
      <div className="col-span-2">
        <ChapterScriptCard
          scriptText={scriptText ?? ""}
          onScriptTextChange={(value) =>
            form.setValue("scriptText", value, { shouldValidate: true })
          }
          fileName={scriptFileName}
          onFileNameChange={setScriptFileName}
          acceptedFormats={acceptedScriptFormats}
        />
      </div>

      <div className="col-span-1 flex flex-col gap-6">
        {/*
          Preview only, deliberately. Narration upload happens on the Chapter
          editor and nowhere else (prompt 16, and AGENTS.md's single-upload-
          surface rule) — this card holds a locally-chosen file so the operator
          can see what they picked while composing the first chapter.
        */}
        <NarrationAudioCard
          preview={audioPreview}
          onFileSelected={setAudioPreview}
          onRemove={() => setAudioPreview(null)}
          acceptedFormats={acceptedAudioFormats}
          maxSizeMb={maxAudioSizeMb}
        />

        <div className="flex flex-col gap-4">
          <ChapterSettingsCard
            idPrefix="chapter-composer"
            titleInputRef={titleInputRef}
            number={number}
            onNumberChange={(value) =>
              form.setValue("number", value, { shouldValidate: true })
            }
            numberError={
              form.formState.errors.number?.message ??
              (numberTaken !== null
                ? `Chapter ${numberTaken} already exists.`
                : undefined)
            }
            title={title}
            onTitleChange={(value) =>
              form.setValue("title", value, { shouldValidate: true })
            }
            titleError={form.formState.errors.title?.message}
            access={access}
            onAccessChange={(value) =>
              form.setValue("access", value, { shouldValidate: true })
            }
          />

          {formError && (
            <p className="field-group__helper field-group__helper--error">
              {formError}
            </p>
          )}

          {bookId === "" && (
            <p className="field-group__helper">
              This chapter is created when you press Create Story.
            </p>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={!form.formState.isValid || pending}
            onClick={form.handleSubmit(onSubmit)}
          >
            {pending ? "Creating…" : "Create chapter"}
          </Button>
        </div>
      </div>
    </div>
  );
});
