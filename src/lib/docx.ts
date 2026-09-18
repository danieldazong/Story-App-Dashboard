/**
 * `.docx` text extraction.
 *
 * Two entry points, deliberately, because two callers have genuinely different
 * shapes:
 *
 * - `extractDocxText(file)` runs in the BROWSER, for the Manuscript card and
 *   the composer's script card. Both parse before any row exists — the
 *   Manuscript card previews chapter splits before the book is created, and the
 *   composer holds text for a chapter that has no id yet — so there is nothing
 *   to upload a file against. See prompt 17's scope decisions.
 *
 * - `extractDocxTextFromBuffer(bytes)` runs on the SERVER, for the Chapter
 *   editor's script card, which does have a saved chapter. Extraction there is
 *   server-side so that normalisation and the empty-text rejection are a
 *   boundary rather than a convention: a client can send anything to
 *   updateChapter, so whatever the browser extracts cannot be trusted as the
 *   definition of script_text.
 *
 * Both share mammoth's `extractRawText` — plain text only, never HTML. No
 * markup reaches the database.
 */

export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}

/**
 * Server-side extraction. Takes a Node Buffer, NOT an ArrayBuffer.
 *
 * mammoth's `arrayBuffer` option is browser-only: package.json's `browser`
 * field swaps `lib/docx/files.js` for a browser build, and only that build
 * reads `arrayBuffer`. The Node build accepts `path` or `buffer` and rejects
 * anything else with `Could not find file in options`.
 *
 * This signature took an ArrayBuffer until 2026-09-17 and therefore threw on
 * EVERY `.docx` — in bulk import and in the Chapter editor's single-file
 * upload alike. It went unnoticed because both probes used `.txt`, which never
 * reaches this function. Verified against mammoth's own test fixtures: with
 * `{ buffer }` the same file extracts, with `{ arrayBuffer }` it throws.
 */
export async function extractDocxTextFromBuffer(
  buffer: Buffer,
): Promise<string> {
  const mammoth = await import("mammoth");
  // The cast is the library's fault, not a shortcut.
  //
  // mammoth's bundled types declare the input as `{ arrayBuffer: ArrayBuffer }`
  // and never model `{ buffer }` or `{ path }`, even though the Node build
  // requires one of those two and its own documentation lists them. Passing the
  // shape the types DO accept is what produced `Could not find file in options`
  // at runtime, so following the types here is precisely what broke .docx.
  //
  // Scoped to this one call rather than a module augmentation: the types are
  // incomplete, not wrong about anything else, and a narrow cast keeps the
  // fiction contained and visible.
  const { value } = await mammoth.extractRawText({
    buffer,
  } as unknown as { arrayBuffer: ArrayBuffer });
  return value;
}
