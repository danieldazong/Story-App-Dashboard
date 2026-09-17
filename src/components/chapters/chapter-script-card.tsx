"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { countWords } from "@/lib/catalog";
import { extractDocxText } from "@/lib/docx";

const TEXT_EXTENSIONS = [".txt", ".md"];

export function ChapterScriptCard({
  scriptText,
  onScriptTextChange,
  fileName,
  onFileNameChange,
}: {
  scriptText: string;
  onScriptTextChange: (value: string) => void;
  fileName: string | null;
  onFileNameChange: (fileName: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        onFileNameChange(file.name);
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
    onFileNameChange(file.name);
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <div>
        <h2 className="card__header-title">Chapter script</h2>
        <p className="card__sub-line">
          Text for this one chapter — for a whole book in one file, use the
          Manuscript card instead.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.txt,.md"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <p className="text-helper text-muted">
          {extracting
            ? "Reading file…"
            : (fileName ?? "DOCX, TXT or MD · or paste prose below")}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={extracting}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose file
        </Button>
      </div>

      {unreadableFile && (
        <p className="text-helper text-destructive">
          {unreadableFile} — couldn&apos;t read this file. Use bulk import, or
          paste the text below.
        </p>
      )}

      <Textarea
        value={scriptText}
        onChange={(event) => {
          onFileNameChange(null);
          onScriptTextChange(event.target.value);
        }}
        rows={16}
        placeholder="Paste chapter prose here…"
        className="min-h-[280px] font-sans text-body leading-relaxed"
      />

      <p className="text-helper text-muted">
        {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
      </p>
    </div>
  );
}
