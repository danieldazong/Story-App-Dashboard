"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
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
import { countWords } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import type { Chapter, ChapterAccess } from "@/types/catalog";

const composerSchema = z.object({
  number: z.number().int().min(1, "Chapter number must be at least 1"),
  title: z.string().min(1, "Title is required"),
  access: z.enum(["free", "locked"]),
  scriptText: z.string().optional(),
});

type ComposerValues = z.infer<typeof composerSchema>;

export type ChapterComposerHandle = {
  focusTitle: () => void;
};

export const ChapterComposer = forwardRef<
  ChapterComposerHandle,
  {
    bookId: string;
    nextNumber: number;
    defaultAccess: ChapterAccess;
    existingNumbers: number[];
    onCreate: (chapter: Chapter) => void;
  }
>(function ChapterComposer(
  { bookId, nextNumber, defaultAccess, existingNumbers, onCreate },
  ref,
) {
  const [numberTaken, setNumberTaken] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
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

    const text = values.scriptText?.trim() ?? "";
    const newChapter: Chapter = {
      id: `${bookId || "book-draft"}-ch-local-${values.number}-${Date.now()}`,
      bookId,
      number: values.number,
      title: values.title,
      script:
        text === ""
          ? { state: "missing" }
          : {
              state: "ready",
              fileName: scriptFileName ?? "Pasted text",
              text,
              wordCount: countWords(text),
            },
      audio: audioPreview
        ? {
            state: "ready",
            fileName: audioPreview.fileName,
            sizeBytes: audioPreview.sizeBytes,
            durationSeconds: audioPreview.durationSeconds ?? 0,
            durationSource: "detected",
            url: audioPreview.url,
          }
        : { state: "missing" },
      access: values.access,
      updatedAt: new Date().toISOString(),
    };

    // No server action exists yet (Clerk/Supabase land in prompts 11-18).
    // This chapter is held in the book editor's local state only — it does
    // not reach mock-catalog.ts and will not survive a page reload.
    onCreate(newChapter);
    toast.success(`Chapter ${String(values.number).padStart(2, "0")} created.`);

    form.reset({
      number: values.number + 1,
      title: "",
      access: defaultAccess,
      scriptText: "",
    });
    setScriptFileName(null);
    setAudioPreview(null);
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
        />
      </div>

      <div className="col-span-1 flex flex-col gap-6">
        <NarrationAudioCard
          preview={audioPreview}
          onFileSelected={setAudioPreview}
          onRemove={() => setAudioPreview(null)}
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

          <Button
            type="button"
            className="w-full"
            disabled={!form.formState.isValid}
            onClick={form.handleSubmit(onSubmit)}
          >
            Create chapter
          </Button>
        </div>
      </div>
    </div>
  );
});
