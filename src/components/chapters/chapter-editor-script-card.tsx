"use client";

import { useRef, useState } from "react";
import { Bold, Clipboard, FileText, Italic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { countWords } from "@/lib/catalog";
import { extractDocxText } from "@/lib/docx";

const TEXT_EXTENSIONS = [".txt", ".md"];

function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  before: string,
  after: string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const { selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const next =
    value.slice(0, selectionStart) +
    before +
    selected +
    after +
    value.slice(selectionEnd);
  return {
    value: next,
    selectionStart: selectionStart + before.length,
    selectionEnd: selectionStart + before.length + selected.length,
  };
}

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
  const wordCount = countWords(scriptText);

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

  function applyWrap(before: string, after: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = wrapSelection(textarea, scriptText, before, after);
    onScriptTextChange(result.value);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  async function handlePasteAsPlainText() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    try {
      const clipboardText = await navigator.clipboard.readText();
      const { selectionStart, selectionEnd } = textarea;
      const next =
        scriptText.slice(0, selectionStart) +
        clipboardText +
        scriptText.slice(selectionEnd);
      onScriptTextChange(next);
      const caret = selectionStart + clipboardText.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    } catch {
      // Clipboard access can be denied by the browser; nothing to insert.
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

      <div className="flex items-center gap-1 border-b border-border px-6 py-2">
        <button
          type="button"
          aria-label="Bold"
          onClick={() => applyWrap("**", "**")}
          className="rounded-input px-2 py-1 text-body font-semibold text-text hover:bg-page"
        >
          <Bold className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Italic"
          onClick={() => applyWrap("_", "_")}
          className="rounded-input px-2 py-1 text-body italic text-text hover:bg-page"
        >
          <Italic className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Heading 2"
          onClick={() => applyWrap("## ", "")}
          className="rounded-input px-2 py-1 text-body font-semibold text-text hover:bg-page"
        >
          H2
        </button>
        <button
          type="button"
          aria-label="Paste as plain text"
          onClick={handlePasteAsPlainText}
          className="rounded-input px-2 py-1 text-text hover:bg-page"
        >
          <Clipboard className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <Textarea
        ref={textareaRef}
        value={scriptText}
        onChange={(event) => onScriptTextChange(event.target.value)}
        placeholder="Chapter prose…"
        className="min-h-[400px] flex-1 resize-none border-0 px-6 py-6 font-sans text-[17px] leading-8 text-text focus-visible:ring-0"
      />

      <p className="border-t border-border px-6 py-4 text-helper text-muted">
        {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
      </p>
    </div>
  );
}
