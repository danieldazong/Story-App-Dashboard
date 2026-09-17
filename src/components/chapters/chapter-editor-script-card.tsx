"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Clipboard,
  FileText,
  Italic,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { countWords, formatBytes } from "@/lib/catalog";
import {
  createScriptUploadUrl,
  discardScriptUpload,
  extractAndSetChapterScript,
  removeChapterScript,
} from "@/app/actions/scripts";
import {
  hasMark,
  parseScript,
  toggleMark,
  type Mark,
} from "@/lib/script-markup";

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Races a Server Action against a timeout, so a stalled upstream dependency
 * reaches the card's `failed` state instead of leaving it mid-upload forever.
 * Same guard as the cover and audio cards.
 */
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), REQUEST_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; uploadedBytes: number; totalBytes: number }
  | { status: "extracting" }
  | { status: "removing" }
  | { status: "failed"; message: string };

export function ChapterEditorScriptCard({
  scriptText,
  onScriptTextChange,
  fileName,
  scriptPath,
  bookId,
  chapterId,
  chapterNumber,
  chapterTitle,
  onUploaded,
  acceptedFormats,
}: {
  scriptText: string;
  onScriptTextChange: (value: string) => void;
  fileName: string | null;
  /**
   * The stored object's path, or null.
   *
   * Null with a fileName present is a legitimate permanent state: 38 chapters
   * predate prompt 17 and have extracted text whose source file was never
   * kept. Those rows show `Choose file` rather than `Replace file` — there is
   * nothing to replace — and must not read as broken.
   */
  scriptPath: string | null;
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  /** Used server-side to strip a leading heading that merely repeats it. */
  chapterTitle: string;
  /** Fired after the row has been repointed, so the page can refresh. */
  onUploaded: () => void;
  /** From app_settings — never constants. See AGENTS.md, prompt 16 notes. */
  acceptedFormats: string[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  // Mirrors the textarea's caret so the toolbar can show which marks the
  // current selection already carries. Kept in state rather than read on each
  // render because a ref change does not re-render, and the buttons have to
  // repaint as the selection moves.
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // One value rather than two booleans, deliberately: "both collapsed" would
  // leave an empty card, and this makes that state unrepresentable instead of
  // something every toggle has to guard against.
  // Preview starts collapsed unless the text already carries markup.
  //
  // With no markup the two panes render identical prose, so the split just
  // halves the editing width for nothing. Opening full-width by default and
  // expanding only when there is formatting to see means the preview costs
  // space exactly when it earns it. Any toolbar use also expands it — see
  // applyMark.
  const [collapsed, setCollapsed] = useState<"none" | "editor" | "preview">(
    () => (/\*\*|_[^_]+_|^##\s/m.test(scriptText) ? "none" : "preview"),
  );
  const wordCount = countWords(scriptText);
  const blocks = parseScript(scriptText);

  function syncSelection(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    setSelection({ start: target.selectionStart, end: target.selectionEnd });
  }

  const busy =
    state.status === "uploading" ||
    state.status === "extracting" ||
    state.status === "removing";

  /**
   * Upload the original file, then extract server-side.
   *
   * Extraction deliberately does NOT happen here. A browser can send anything
   * to updateChapter, so if the client decided what `script_text` became, the
   * normalisation rules and the empty-text rejection would be conventions
   * rather than a boundary. See app/actions/scripts.ts.
   */
  async function uploadAndExtract(file: File) {
    // Client checks are a courtesy; createScriptUploadUrl is the boundary.
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!acceptedFormats.map((f) => f.toLowerCase()).includes(extension)) {
      setState({
        status: "failed",
        message: `Scripts must be ${acceptedFormats.join(" or ")}. This file is ${extension || "an unrecognised type"}.`,
      });
      return;
    }

    setState({ status: "uploading", uploadedBytes: 0, totalBytes: file.size });

    let signed;
    try {
      signed = await withTimeout(
        createScriptUploadUrl({
          bookId,
          chapterId,
          fileName: file.name,
          sizeBytes: file.size,
        }),
        "Timed out starting the upload. Check your connection and try again.",
      );
    } catch (error) {
      setState({
        status: "failed",
        message:
          error instanceof Error ? error.message : "Couldn't start the upload.",
      });
      return;
    }

    if (!signed.ok) {
      setState({ status: "failed", message: signed.formError });
      return;
    }

    const { path, token, contentType } = signed.data;
    const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/scripts/${path}?token=${token}`;

    // XHR rather than fetch: only XHR reports upload progress. Verified against
    // the live project before this was built — mint, PUT, HTTP 200.
    const uploaded = await new Promise<{ ok: boolean; message?: string }>(
      (resolve) => {
        const request = new XMLHttpRequest();
        request.open("PUT", endpoint, true);
        request.setRequestHeader("Content-Type", contentType);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setState({
              status: "uploading",
              uploadedBytes: event.loaded,
              totalBytes: file.size,
            });
          }
        };
        request.onload = () =>
          resolve(
            request.status >= 200 && request.status < 300
              ? { ok: true }
              : request.status === 400 || request.status === 403
                ? { ok: false, message: "The upload link expired. Try again." }
                : {
                    ok: false,
                    message: `Storage rejected the upload (${request.status}).`,
                  },
          );
        request.onerror = () =>
          resolve({ ok: false, message: "Network error during upload." });
        request.send(file);
      },
    );

    if (!uploaded.ok) {
      setState({ status: "failed", message: uploaded.message ?? "Upload failed." });
      void discardScriptUpload(path);
      return;
    }

    setState({ status: "extracting" });

    let extracted;
    try {
      extracted = await withTimeout(
        extractAndSetChapterScript({
          bookId,
          chapterId,
          chapterNumber,
          chapterTitle,
          path,
          fileName: file.name,
          previousPath: scriptPath,
        }),
        "Timed out reading the file. It uploaded — try Replace to confirm it saved.",
      );
    } catch (error) {
      setState({
        status: "failed",
        message:
          error instanceof Error ? error.message : "Couldn't read the file.",
      });
      return;
    }

    if (!extracted.ok) {
      setState({ status: "failed", message: extracted.formError });
      return;
    }

    setState({ status: "idle" });
    // The row is the truth now. Refresh rather than pushing text back through
    // react-hook-form, which would mark the form dirty over work already saved
    // — the same reason narration stopped feeding `audioDirty`.
    onUploaded();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void uploadAndExtract(file);
  }

  async function handleRemove() {
    setState({ status: "removing" });
    const result = await removeChapterScript({ bookId, chapterId, chapterNumber });

    if (!result.ok) {
      setState({ status: "failed", message: result.formError });
      setConfirmingRemove(false);
      return;
    }

    setState({ status: "idle" });
    setConfirmingRemove(false);
    onUploaded();
  }

  /**
   * Applies or removes a mark on the current selection.
   *
   * Reads offsets from the textarea rather than from `selection` state so a
   * click that happens before the selection handler has flushed still acts on
   * the real caret.
   */
  function applyMark(mark: Mark) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = toggleMark(
      scriptText,
      textarea.selectionStart,
      textarea.selectionEnd,
      mark,
    );

    onScriptTextChange(result.value);
    setSelection({ start: result.selectionStart, end: result.selectionEnd });
    // Applying a mark is the moment the preview becomes worth its width.
    setCollapsed((current) => (current === "preview" ? "none" : current));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  /**
   * Copies the selected prose to the clipboard.
   *
   * This button used to do the opposite: it read the SYSTEM clipboard and
   * replaced the selection with it. With an empty clipboard that overwrote the
   * operator's highlighted text with an empty string — silent data loss that
   * looked like a broken "cut". It also called textarea.focus() afterwards,
   * which scrolled the page to the caret now that the card is taller.
   *
   * It copies now, matching its Clipboard icon: nothing here mutates
   * scriptText, and nothing moves focus, so neither failure can recur.
   */
  async function handleCopySelection() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selected = scriptText.slice(
      textarea.selectionStart,
      textarea.selectionEnd,
    );

    // Copying nothing is not a success. Saying so beats a toast that claims a
    // copy the operator will discover was empty only when they paste.
    if (selected === "") {
      toast.error("Select some text first, then copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(selected);
      toast.success(
        `Copied ${countWords(selected).toLocaleString()} ${
          countWords(selected) === 1 ? "word" : "words"
        }.`,
      );
    } catch {
      // Clipboard writes need a secure context and can be refused outright.
      // Previously this was swallowed silently, so a denied copy was
      // indistinguishable from a successful one.
      toast.error("Your browser blocked clipboard access.");
    }
  }

  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border p-6">
        {fileName ? (
          <>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted" aria-hidden="true" />
              <span className="font-mono text-mono text-text">
                {fileName}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {/*
                `Replace file` only when there IS a file to replace. A row with
                text but no stored path predates prompt 17 — its source was
                never kept and cannot be recovered — so it offers `Choose file`
                instead. That is a normal state, not a repair.
              */}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  scriptPath
                    ? setConfirmingReplace(true)
                    : fileInputRef.current?.click()
                }
                className="text-helper text-muted hover:text-text disabled:opacity-50"
              >
                {scriptPath ? "Replace file" : "Choose file"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingRemove(true)}
                className="text-helper text-destructive hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-helper text-muted">
              No script file uploaded — paste prose below or choose a file.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </Button>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(",")}
        className="hidden"
        disabled={busy}
        onChange={handleFileChange}
      />

      {/*
        Upload and extraction progress, and every failure. `Retry` is rendered
        once for the whole failed state rather than per message — a terminal
        state with no way out is the Manuscript-card defect recorded in
        AGENTS.md.
      */}
      {state.status === "uploading" && (
        <div className="flex flex-col gap-2 px-6 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-helper text-muted">Uploading…</span>
            <span className="font-mono text-mono text-muted">
              {formatBytes(state.uploadedBytes)} / {formatBytes(state.totalBytes)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${Math.round((state.uploadedBytes / state.totalBytes) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {state.status === "extracting" && (
        <p className="px-6 pt-4 text-helper text-muted">Extracting text…</p>
      )}

      {state.status === "removing" && (
        <p className="px-6 pt-4 text-helper text-muted">Removing…</p>
      )}

      {state.status === "failed" && (
        <div className="flex items-center justify-between gap-4 px-6 pt-4">
          <p className="text-helper text-destructive">{state.message}</p>
          <Button
            variant="muted"
            size="sm"
            onClick={() => {
              setState({ status: "idle" });
              fileInputRef.current?.click();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/*
        Each button reflects whether the current selection already carries its
        mark, and a second click removes it. Previously every click wrapped
        again, so Bold on bold text produced ****text**** — literal asterisks
        around bold prose. `aria-pressed` carries the same state to assistive
        tech that the background colour carries visually.
      */}
      <div className="flex items-center gap-1 border-b border-border px-6 py-2">
        {(
          [
            { mark: "bold", label: "Bold", icon: <Bold className="h-4 w-4" aria-hidden="true" /> },
            { mark: "italic", label: "Italic", icon: <Italic className="h-4 w-4" aria-hidden="true" /> },
            { mark: "heading", label: "Heading 2", icon: "H2" },
          ] as const
        ).map(({ mark, label, icon }) => {
          const active = hasMark(scriptText, selection.start, selection.end, mark);
          return (
            <button
              key={mark}
              type="button"
              aria-label={label}
              aria-pressed={active}
              onClick={() => applyMark(mark)}
              className={cn(
                "rounded-input px-2 py-1 text-body font-semibold text-text hover:bg-page",
                active && "bg-page text-primary",
              )}
            >
              {icon}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Copy selected text"
          title="Copy selected text"
          onClick={handleCopySelection}
          className="rounded-input px-2 py-1 text-text hover:bg-page"
        >
          <Clipboard className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/*
        Editor and preview side by side. A <textarea> renders plain text only —
        no styling makes **bold** appear bold inside one — so the formatting is
        shown in a rendered pane next to it rather than by replacing the editing
        surface. That keeps script_text as the plain Markdown the mobile reader
        consumes (see lib/script-markup.ts).
      */}
      <div className="flex flex-1 divide-x divide-border">
        {/*
          The editor column. When collapsed it becomes a narrow strip with an
          expand control, and the preview takes the full width.

          The Textarea stays MOUNTED either way — only its container is hidden.
          Unmounting it would null textareaRef, and both applyMark() and
          handleCopySelection() early-return on a null ref, so the whole toolbar
          would silently stop working while still looking clickable.
        */}
        <div
          className={cn(
            "flex flex-col",
            collapsed === "editor" ? "w-12 shrink-0" : "flex-1",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            {collapsed !== "editor" && (
              <span className="pl-3 text-section-label text-muted">EDITOR</span>
            )}
            <button
              type="button"
              aria-label={
                collapsed === "editor" ? "Expand editor" : "Collapse editor"
              }
              aria-expanded={collapsed !== "editor"}
              title={
                collapsed === "editor" ? "Expand editor" : "Collapse editor"
              }
              onClick={() =>
                setCollapsed(collapsed === "editor" ? "none" : "editor")
              }
              className="rounded-input p-1.5 text-muted hover:bg-page hover:text-text"
            >
              {collapsed === "editor" ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          <div className={cn("flex flex-1", collapsed === "editor" && "hidden")}>
            <Textarea
              ref={textareaRef}
              value={scriptText}
              onChange={(event) => {
                onScriptTextChange(event.target.value);
                syncSelection(event);
              }}
              onSelect={syncSelection}
              onKeyUp={syncSelection}
              onMouseUp={syncSelection}
              placeholder="Chapter prose…"
              className="min-h-[400px] w-full resize-none border-0 px-6 py-6 font-sans text-[17px] leading-8 text-text focus-visible:ring-0"
            />
          </div>
        </div>

        {/*
          Rendered from parsed data as React elements, never via
          dangerouslySetInnerHTML: this prose arrives from uploaded DOCX files
          and pasted clipboard content, so it is not trusted input.

          Type matches the textarea's own inline values (17px / leading-8) so
          the two panes line up; globals.css has no prose token to use instead.
        */}
        <div
          className={cn(
            "flex flex-col bg-page",
            collapsed === "preview" ? "w-12 shrink-0" : "flex-1",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <button
              type="button"
              aria-label={
                collapsed === "preview" ? "Expand preview" : "Collapse preview"
              }
              aria-expanded={collapsed !== "preview"}
              title={
                collapsed === "preview" ? "Expand preview" : "Collapse preview"
              }
              onClick={() =>
                setCollapsed(collapsed === "preview" ? "none" : "preview")
              }
              className="rounded-input p-1.5 text-muted hover:bg-page hover:text-text"
            >
              {collapsed === "preview" ? (
                <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelRightClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            {collapsed !== "preview" && (
              <span className="pr-3 text-section-label text-muted">
                PREVIEW
              </span>
            )}
          </div>

        <div
          aria-live="polite"
          className={cn(
            "min-h-[400px] flex-1 overflow-auto px-6 py-6 font-sans text-[17px] leading-8 text-text",
            collapsed === "preview" && "hidden",
          )}
        >
          {blocks.length === 0 ? (
            <p className="text-helper text-muted">
              Formatted preview appears here as you type.
            </p>
          ) : (
            blocks.map((block, index) =>
              block.kind === "heading" ? (
                // text-page-title (24px), not text-chapter-title (16px): the
                // preview prose is 17px, so the 16px token would render a
                // heading SMALLER than the body around it.
                <h2 key={index} className="mb-4 mt-6 text-page-title first:mt-0">
                  {block.spans.map((span, spanIndex) => (
                    <span
                      key={spanIndex}
                      className={cn(
                        span.bold && "font-semibold",
                        span.italic && "italic",
                      )}
                    >
                      {span.text}
                    </span>
                  ))}
                </h2>
              ) : (
                <p key={index} className="mb-4 last:mb-0">
                  {block.spans.map((span, spanIndex) => (
                    <span
                      key={spanIndex}
                      className={cn(
                        span.bold && "font-semibold",
                        span.italic && "italic",
                      )}
                    >
                      {span.text}
                    </span>
                  ))}
                </p>
              ),
            )
          )}
          </div>
        </div>
      </div>

      <p className="border-t border-border px-6 py-4 text-helper text-muted">
        {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
      </p>

      {/*
        Replace is the only script action that needs confirming: it overwrites
        script_text with the new file's contents, discarding any inline edits
        the operator has made since the last upload. Choosing a file is
        deferred until they confirm, so cancelling costs nothing.
      */}
      <Dialog
        open={confirmingReplace}
        onOpenChange={(open) => !busy && setConfirmingReplace(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace this script file?</DialogTitle>
            <DialogDescription>
              The new file&apos;s text replaces everything in the editor,
              including any edits made since the last upload. The original file
              is deleted once the new one is saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="muted"
              disabled={busy}
              onClick={() => setConfirmingReplace(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setConfirmingReplace(false);
                fileInputRef.current?.click();
              }}
            >
              Choose replacement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmingRemove}
        onOpenChange={(open) => !busy && setConfirmingRemove(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this script?</DialogTitle>
            <DialogDescription>
              The chapter&apos;s text is cleared and the uploaded file is
              deleted from storage. This chapter returns to the Dashboard queue.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="muted"
              disabled={busy}
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              {state.status === "removing" ? "Removing…" : "Remove script"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
