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
import { cn } from "@/lib/utils";
import { countWords } from "@/lib/catalog";
import { extractDocxText } from "@/lib/docx";
import {
  hasMark,
  parseScript,
  toggleMark,
  type Mark,
} from "@/lib/script-markup";

const TEXT_EXTENSIONS = [".txt", ".md"];

export function ChapterEditorScriptCard({
  scriptText,
  onScriptTextChange,
  fileName,
  onFileChange,
}: {
  scriptText: string;
  onScriptTextChange: (value: string) => void;
  fileName: string | null;
  onFileChange: (fileName: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [unreadableFile, setUnreadableFile] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  // Mirrors the textarea's caret so the toolbar can show which marks the
  // current selection already carries. Kept in state rather than read on each
  // render because a ref change does not re-render, and the buttons have to
  // repaint as the selection moves.
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  // One value rather than two booleans, deliberately: "both collapsed" would
  // leave an empty card, and this makes that state unrepresentable instead of
  // something every toggle has to guard against.
  const [collapsed, setCollapsed] = useState<"none" | "editor" | "preview">(
    "none",
  );
  const wordCount = countWords(scriptText);
  const blocks = parseScript(scriptText);

  function syncSelection(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    setSelection({ start: target.selectionStart, end: target.selectionEnd });
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUnreadableFile(null);
    const name = file.name.toLowerCase();

    if (name.endsWith(".docx")) {
      setExtracting(true);
      try {
        const text = await extractDocxText(file);
        onScriptTextChange(text);
        onFileChange(file.name);
      } catch {
        setUnreadableFile(file.name);
      } finally {
        setExtracting(false);
      }
      return;
    }

    const isTextFile = TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!isTextFile) {
      setUnreadableFile(file.name);
      return;
    }

    const text = await file.text();
    onScriptTextChange(text);
    onFileChange(file.name);
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-helper text-muted hover:text-text"
              >
                Replace file
              </button>
              <button
                type="button"
                onClick={() => {
                  onFileChange(null);
                  onScriptTextChange("");
                }}
                className="text-helper text-destructive hover:underline"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-helper text-muted">
              {extracting
                ? "Reading file…"
                : "No script file uploaded — paste prose below or choose a file."}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={extracting}
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
        accept=".docx,.txt,.md"
        className="hidden"
        onChange={handleFileChange}
      />

      {unreadableFile && (
        <p className="px-6 pt-4 text-helper text-destructive">
          {unreadableFile} — couldn&apos;t read this file. Paste the text
          below instead.
        </p>
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
    </div>
  );
}
