"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ChapterEditorScriptCard } from "@/components/chapters/chapter-editor-script-card";
import { ChapterEditorAudioCard } from "@/components/chapters/chapter-editor-audio-card";
import { ChapterEditorSettingsCard } from "@/components/chapters/chapter-editor-settings-card";
import { updateChapter } from "@/app/actions/chapters";
import type { Chapter, ChapterAccess } from "@/types/catalog";

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
  acceptedAudioFormats,
  maxAudioSizeMb,
  acceptedScriptFormats,
}: {
  bookId: string;
  bookTitle: string;
  chapter: Chapter;
  previousHref: string | null;
  nextHref: string | null;
  /** From app_settings — never constants. See AGENTS.md, prompt 16 notes. */
  acceptedAudioFormats: string[];
  maxAudioSizeMb: number;
  acceptedScriptFormats: string[];
}) {
  const router = useRouter();
  // Derived from the row's own updated_at, never from a local clock — the
  // status line must never claim a save that did not happen.
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [pending, setSaving] = useState(false);
  const [durationPending, setDurationSaving] = useState(false);

  const form = useForm<ChapterEditValues>({
    resolver: zodResolver(chapterEditSchema),
    defaultValues: defaultValuesFor(chapter),
    mode: "onChange",
  });

  // scriptFileName is deliberately not destructured: the script card reads the
  // file name from the server row (chapter.script), not from form state, since
  // an upload extracts and persists server-side and then revalidates. It stays
  // in the schema and in the submit payload so a normal Save preserves it.
  const { number, title, access, scriptText } = form.watch();
  // Narration is no longer part of the form's unsaved state. An upload persists
  // itself the moment it completes and the route revalidates, so there is
  // nothing for Save chapter to write — and `audioDirty` claiming otherwise
  // would leave Save enabled over work already saved.
  const isDirty = form.formState.isDirty;

  // Re-render every 30s so the "Saved n min ago" line keeps advancing.
  useEffect(() => {
    const interval = setInterval(() => forceTick((tick) => tick + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Re-seed the form when the SERVER row's script changes underneath it.
   *
   * `useForm` reads `defaultValues` once, at mount. `router.refresh()` refetches
   * the route and React hands this component a new `chapter` prop — but
   * react-hook-form does not re-seed from a changed prop, so the textarea kept
   * showing whatever it was born with. Uploading a script persisted correctly,
   * revalidated correctly, and then displayed nothing until a manual browser
   * reload: 0 words over a 50,978-word file.
   *
   * The file-name row updated instantly the whole time, because it reads
   * `chapter.script` directly rather than through the form. That asymmetry is
   * what made it look like the upload had failed.
   *
   * `resetDefaultValues`, deliberately, and not the two obvious alternatives:
   *
   *   - `reset()` re-registers every field and re-runs the schema, cascading
   *     setState into sibling Controllers during render ("Cannot update a
   *     component while rendering a different component"). That defect has been
   *     fixed three times in this codebase — see AGENTS.md, Debugging Playbooks.
   *   - `setValue()` would mark the form dirty over text the server has already
   *     stored, leaving `Save chapter` enabled with nothing to write.
   *
   * resetDefaultValues moves the clean baseline, so the new prose shows AND the
   * form reads as saved, which it is.
   *
   * Guarded on the row's own values rather than on prop identity: `chapter` is a
   * fresh object on every refresh, so keying on the object would re-seed on
   * every render and discard in-progress typing. This only fires when the stored
   * text or the stored file actually differs from the baseline this form was
   * seeded with.
   *
   * Note this DOES replace unsaved edits when an upload completes — correctly:
   * the upload is the newer truth, and the Replace dialog already warns that
   * inline edits will be lost.
   */
  const serverScriptText =
    chapter.script.state === "ready" ? chapter.script.text : "";
  const serverScriptFileName =
    chapter.script.state === "ready" ? chapter.script.fileName : null;

  // The comparison baseline is a ref, NOT form.formState.defaultValues.
  //
  // That was this fix's first attempt and it silently did nothing.
  // `formState` is a Proxy backed by RHF's `_proxyFormState`, which only marks
  // a field as subscribed when it is read during RENDER. Reading
  // `formState.defaultValues` solely inside an effect never registers the
  // subscription, so the effect closed over a mount-time snapshot, the guard
  // compared new server text against the original empty string, found them
  // "equal" to its stale copy, and early-returned on every upload.
  //
  // A ref has no subscription semantics to get wrong. It holds exactly what
  // this component last seeded, which is the only question being asked.
  const seededScript = useRef({
    text: serverScriptText,
    fileName: serverScriptFileName,
  });

  useEffect(() => {
    if (
      seededScript.current.text === serverScriptText &&
      seededScript.current.fileName === serverScriptFileName
    ) {
      return;
    }

    seededScript.current = {
      text: serverScriptText,
      fileName: serverScriptFileName,
    };

    form.resetDefaultValues({
      ...form.getValues(),
      scriptText: serverScriptText,
      scriptFileName: serverScriptFileName,
    });
    // setValue in addition to resetDefaultValues: the former moves the clean
    // baseline, but `watch()` reads the VALUES, and resetDefaultValues does not
    // touch those. Without this the baseline updated while the textarea kept
    // rendering the old (empty) value — the same "persisted but not displayed"
    // symptom, one layer down.
    form.setValue("scriptText", serverScriptText, { shouldDirty: false });
    form.setValue("scriptFileName", serverScriptFileName, {
      shouldDirty: false,
    });
  }, [form, serverScriptText, serverScriptFileName]);

  // The await stays outside any transition: React may be mid-render when a
  // transition's continuation resumes, and react-hook-form's setError/reset
  // write to Controller state, which throws "Cannot update a component while
  // rendering a different component".
  async function onSubmit(values: ChapterEditValues) {
    setFormError(null);
    setSaving(true);

    const result = await updateChapter({
      chapterId: chapter.id,
      bookId,
      number: values.number,
      title: values.title,
      access: values.access,
      scriptText: values.scriptText,
      scriptFileName: values.scriptFileName,
    });

    setSaving(false);

    if (!result.ok) {
      setFormError(result.formError);
      for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
        form.setError(field as keyof ChapterEditValues, { message });
      }
      return;
    }

    setSavedAt(new Date(result.data.updatedAt));
    toast.success("Chapter saved");

    // resetDefaultValues(), not reset() — reset() re-registers every field and
    // re-runs the schema, cascading setState into sibling Controllers during
    // render ("Cannot update a component while rendering a different
    // component"). This is the same defect fixed in book-editor.tsx and
    // settings-screen.tsx; see AGENTS.md, Debugging Playbooks.
    form.resetDefaultValues(values);

    // The chapter number is part of this route, so a number change moves the
    // page. Otherwise nothing further is needed: updateChapter() already
    // revalidated this route, and the Server Action response carries the
    // refreshed payload — calling router.refresh() as well fired a second full
    // round trip for data already in flight. See AGENTS.md, Performance Rules.
    if (result.data.number !== chapter.number) {
      router.replace(`/books/${bookId}/chapters/${result.data.number}`);
    }
  }

  async function persistDuration(seconds: number): Promise<boolean> {
    setDurationSaving(true);

    const result = await updateChapter({
      chapterId: chapter.id,
      bookId,
      number: form.getValues("number"),
      title: form.getValues("title"),
      access: form.getValues("access"),
      scriptText: form.getValues("scriptText"),
      scriptFileName: form.getValues("scriptFileName"),
      audioDurationSeconds: seconds,
      audioDurationSource: "manual",
    });

    setDurationSaving(false);

    if (result.ok) {
      setSavedAt(new Date(result.data.updatedAt));
      toast.success("Duration saved");
      // updateChapter() already revalidated this route — see AGENTS.md,
      // Performance Rules.
    } else {
      toast.error(result.formError);
    }

    return result.ok;
  }

  const statusLine = (() => {
    if (isDirty) return "Unsaved changes";
    if (savedAt) {
      const minutes = Math.max(
        0,
        Math.round((Date.now() - savedAt.getTime()) / 60_000),
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
        {/*
          The breadcrumb above already links back to the book, but muted inline
          text does not read as a control — operators were reaching for the
          browser's back button instead. This states the destination by name.

          Deliberately a text link rather than an arrow icon button: the Chapter
          settings card already uses ChevronLeft for PREVIOUS CHAPTER, and a
          second left-arrow meaning something else would be a genuine ambiguity.
          Matches the "← Back to Settings" pattern in app/account/[[...rest]].
        */}
        <Link
          href={`/books/${bookId}`}
          className="w-fit text-helper text-muted hover:text-text"
        >
          ← Back to {bookTitle}
        </Link>
        <div className="card__header">
          <div className="flex items-baseline gap-3">
            {/*
              text-chapter-title, not text-page-title: this heading carries an
              authored chapter title that can run to two lines, unlike the short
              screen names every other page title holds. Scoped to this h1 — the
              shared token stays 24px for Dashboard, Books, Settings and the
              rest.
            */}
            <h1 className="text-chapter-title">
              Chapter {chapter.number} · {chapter.title}
            </h1>
            {statusLine && (
              <span className="text-helper text-muted">{statusLine}</span>
            )}
          </div>
          <div className="card__header-actions">
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={!isDirty || !form.formState.isValid || pending}
            >
              {pending ? "Saving…" : "Save chapter"}
            </Button>
          </div>
        </div>
        {formError && (
          <p className="field-group__helper field-group__helper--error">
            {formError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          {/*
            fileName and scriptPath come from the server row, not form state:
            an upload extracts and persists server-side, then revalidates, so
            the card re-renders from the persisted truth. Feeding the extracted
            text back through react-hook-form would mark the form dirty over
            work already saved — the same reason narration stopped driving
            `audioDirty`.
          */}
          <ChapterEditorScriptCard
            scriptText={scriptText}
            onScriptTextChange={(value) =>
              form.setValue("scriptText", value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            fileName={
              chapter.script.state === "ready" ? chapter.script.fileName : null
            }
            scriptPath={
              chapter.script.state === "ready" ? chapter.script.path : null
            }
            bookId={bookId}
            chapterId={chapter.id}
            chapterNumber={chapter.number}
            chapterTitle={chapter.title}
            onUploaded={() => router.refresh()}
            acceptedFormats={acceptedScriptFormats}
          />
        </div>

        <div className="col-span-1 flex flex-col gap-6">
          {/*
            `audio` comes straight from the server row now, not local state:
            setChapterAudio revalidates this route, so the card re-renders from
            the persisted truth rather than from an optimistic copy that could
            disagree with it.
          */}
          <ChapterEditorAudioCard
            audio={chapter.audio}
            bookId={bookId}
            chapterId={chapter.id}
            chapterNumber={chapter.number}
            onUploaded={() => router.refresh()}
            onPersistDuration={persistDuration}
            durationPending={durationPending}
            acceptedFormats={acceptedAudioFormats}
            maxSizeMb={maxAudioSizeMb}
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
