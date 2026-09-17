"use client";

import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ChapterScriptCard } from "@/components/chapters/chapter-script-card";
import { NarrationAudioCard } from "@/components/chapters/narration-audio-card";
import { ChapterSettingsCard } from "@/components/chapters/chapter-settings-card";
import type { ChapterAccess } from "@/types/catalog";

const chapterCreateSchema = z.object({
  number: z.number().int().min(1, "Chapter number must be at least 1"),
  title: z.string().min(1, "Title is required"),
  access: z.enum(["free", "locked"]),
  scriptText: z.string().optional(),
});

type ChapterCreateValues = z.infer<typeof chapterCreateSchema>;

export function ChapterCreateEditor({
  bookId,
  bookTitle,
  nextNumber,
  defaultAccess,
  existingNumbers,
}: {
  bookId: string;
  bookTitle: string;
  nextNumber: number;
  defaultAccess: ChapterAccess;
  existingNumbers: number[];
}) {
  const [numberTaken, setNumberTaken] = useState<number | null>(null);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);

  const form = useForm<ChapterCreateValues>({
    resolver: zodResolver(chapterCreateSchema),
    defaultValues: {
      number: nextNumber,
      title: "",
      access: defaultAccess,
      scriptText: "",
    },
    mode: "onChange",
  });

  const { number, title, access, scriptText } = form.watch();

  function onSubmit(values: ChapterCreateValues) {
    if (existingNumbers.includes(values.number)) {
      setNumberTaken(values.number);
      form.setError("number", {
        message: `Chapter ${values.number} already exists.`,
      });
      return;
    }
    setNumberTaken(null);
    // No server action exists yet (Clerk/Supabase land in prompts 11-18).
    // Stay on this screen rather than fabricating a new chapter id.
    toast.success(
      `Validated. Chapter creation isn't wired to a backend yet — nothing was saved.`,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Books", href: "/books" },
          { label: bookTitle, href: `/books/${bookId}` },
          { label: "New chapter" },
        ]}
        title="New chapter"
        action={
          <Button
            type="button"
            disabled={!form.formState.isValid}
            onClick={form.handleSubmit(onSubmit)}
          >
            Create chapter
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-6">
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
          <NarrationAudioCard />

          <ChapterSettingsCard
            idPrefix="chapter-create"
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
        </div>
      </div>
    </div>
  );
}
