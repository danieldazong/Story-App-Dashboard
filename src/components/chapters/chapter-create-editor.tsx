"use client";

import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createChapter } from "@/app/actions/chapters";
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
  acceptedAudioFormats,
  maxAudioSizeMb,
  acceptedScriptFormats,
}: {
  bookId: string;
  bookTitle: string;
  nextNumber: number;
  defaultAccess: ChapterAccess;
  existingNumbers: number[];
  /** From app_settings, for the Narration card's constraint line. */
  acceptedAudioFormats: string[];
  maxAudioSizeMb: number;
  /** From app_settings, for the Chapter script card. */
  acceptedScriptFormats: string[];
}) {
  const [numberTaken, setNumberTaken] = useState<number | null>(null);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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
    setFormError(null);

    // This screen used to validate and then toast "isn't wired to a backend
    // yet — nothing was saved", which was true when written but stopped being
    // true in prompt 14. It sat stranded while the Chapter composer saved the
    // identical form through createChapter, so an operator who reached this
    // route lost their work with a success-coloured toast.
    startTransition(async () => {
      const text = values.scriptText?.trim() ?? "";
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

      toast.success(
        `Chapter ${String(result.data.number).padStart(2, "0")} created.`,
      );
      // Straight into the chapter that was just created, so the operator lands
      // where the work continues rather than on an emptied form.
      router.push(`/books/${bookId}/chapters/${result.data.number}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: "Stories", href: "/books" },
          { label: bookTitle, href: `/books/${bookId}` },
          { label: "New chapter" },
        ]}
        backLink={{ href: `/books/${bookId}`, label: bookTitle }}
        title="New chapter"
        action={
          <Button
            type="button"
            disabled={!form.formState.isValid || pending}
            onClick={form.handleSubmit(onSubmit)}
          >
            {pending ? "Creating…" : "Create chapter"}
          </Button>
        }
      />

      {formError && (
        <p className="field-group__helper field-group__helper--error">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-3 gap-6">
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
          {/* Preview only — narration upload lives on the Chapter editor. */}
          <NarrationAudioCard
            acceptedFormats={acceptedAudioFormats}
            maxSizeMb={maxAudioSizeMb}
          />

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
