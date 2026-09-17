"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { formatBytes } from "@/lib/catalog";
import type { CoverAsset } from "@/types/catalog";

type CoverPreview = {
  url: string;
  fileName: string;
  sizeBytes: number;
} | null;

function initialPreview(cover: CoverAsset): CoverPreview {
  if (cover.state === "missing") return null;
  return {
    url: cover.url,
    fileName: cover.fileName,
    sizeBytes: cover.sizeBytes,
  };
}

export function CoverThumbnailCard({ cover }: { cover: CoverAsset }) {
  const [preview, setPreview] = useState<CoverPreview>(initialPreview(cover));
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview({
      url: URL.createObjectURL(file),
      fileName: file.name,
      sizeBytes: file.size,
    });
    event.target.value = "";
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="card__header-title">Cover thumbnail</h2>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="aspect-[2/3] w-full max-w-[200px] overflow-hidden rounded-input border border-dashed border-border bg-page">
        {preview ? (
          <Image
            src={preview.url}
            alt="Cover preview"
            width={400}
            height={600}
            className="h-full w-full object-cover"
            unoptimized={preview.url.startsWith("blob:")}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-helper text-muted">
              Drop a cover image, or choose a file
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-input border border-border bg-card px-3 py-1.5 text-body text-text hover:bg-page"
            >
              Choose file
            </button>
          </div>
        )}
      </div>

      {preview && (
        <>
          <p className="font-mono text-mono text-muted">
            {preview.fileName} · {formatBytes(preview.sizeBytes)}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-helper text-muted hover:text-text"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-helper text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        </>
      )}

      <p className="field-group__helper">JPG, PNG or WebP · 800×1200 · max 2MB</p>
    </div>
  );
}
