"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ChapterEditorScriptCard } from "@/components/chapters/chapter-editor-script-card";
import { ChapterEditorAudioCard } from "@/components/chapters/chapter-editor-audio-card";
import { ChapterEditorSettingsCard } from "@/components/chapters/chapter-editor-settings-card";
import type { AudioAsset, Chapter, ChapterAccess } from "@/types/catalog";

const chapterEditSchema = z.object({
  number: z.number().int().min(1, "Chapter number must be at least 1"),
  title: z.string().min(1, "Title is required"),
  access: z.enum(["free", "locked"]),
  scriptText: z.string(),
  scriptFileName: z.string().nullable(),
});

type ChapterEditValues = z.infer<typeof chapterEditSchema>;

function defaultValuesFor(chapter: Chapter): ChapterEditValues {
  return {
    number: chapter.number,
    title: chapter.title,
    access: chapter.access,
    scriptText: chapter.script.state === "ready" ? chapter.script.text : "",
    scriptFileName:
      chapter.script.state === "ready" ? chapter.script.fileName : null,
  };
}

export function ChapterEditor({
  bookId,
  bookTitle,
  chapter,
  previousHref,
  nextHref,
}: {
  bookId: string;
  bookTitle: string;
  chapter: Chapter;
  previousHref: string | null;
  nextHref: string | null;
}) {
  const [audio, setAudio] = useState<AudioAsset>(chapter.audio);
  const [audioDirty, setAudioDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [, forceTick] = useState(0);

  const form = useForm<ChapterEditValues>({
    resolver: zodResolver(chapterEditSchema),
    defaultValues: defaultValuesFor(chapter),
    mode: "onChange",
  });

  const { number, title, access, scriptText, scriptFileName } = form.watch();
  const isDirty = form.formState.isDirty || audioDirty;

  // Re-render every 30s so the "Saved n min ago" line keeps advancing.
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  function onSubmit() {
    // No server action exists yet (Clerk/Supabase land in prompts 11-18).
    // This only updates local component state and the status line below —
    // nothing is written to mock-catalog.ts or a database.
    setLastSavedAt(new Date());
    setAudioDirty(false);
    toast.success("Chapter saved");
    form.reset(form.getValues());
  }

  const statusLine = (() => {
    if (isDirty) return "Unsaved changes";
    if (lastSavedAt) {
      const minutes = Math.max(
        0,
        Math.round((Date.now() - lastSavedAt.getTime()) / 60_000),
      );
      return minutes === 0 ? "Saved just now" : `Saved ${minutes} min ago`;
    }
    return null;
  })();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: "Books", href: "/books" },
            { label: bookTitle, href: `/books/${bookId}` },
            { label: `Chapter ${chapter.number}` },
          ]}
        />
        <div className="card__header">
          <div className="flex items-baseline gap-3">
            <h1 className="text-page-title">
              Chapter {chapter.number} · {chapter.title}
            </h1>
            {statusLine && (
              <span className="text-helper text-muted">{statusLine}</span>
            )}
          </div>
          <div className="card__header-actions">
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={!isDirty || !form.formState.isValid}
            >
              Save chapter
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <ChapterEditorScriptCard
            scriptText={scriptText}
            onScriptTextChange={(value) =>
              form.setValue("scriptText", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            fileName={scriptFileName}
            onFileChange={(fileName) =>
              form.setValue("scriptFileName", fileName, { shouldDirty: true })
            }
          />
        </div>

        <div className="col-span-1 flex flex-col gap-6">
          <ChapterEditorAudioCard
            audio={audio}
            onAudioChange={(next) => {
              setAudio(next);
              setAudioDirty(true);
            }}
          />

          <ChapterEditorSettingsCard
            number={number}
            onNumberChange={(value) =>
              form.setValue("number", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            numberError={form.formState.errors.number?.message}
            title={title}
            onTitleChange={(value) =>
              form.setValue("title", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            titleError={form.formState.errors.title?.message}
            access={access}
            onAccessChange={(value) =>
              form.setValue("access", value as ChapterAccess, {
                shouldDirty: true,
              })
            }
            previousHref={previousHref}
            nextHref={nextHref}
          />
        </div>
      </div>
    </div>
  );
}
