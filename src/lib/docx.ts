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

export async function extractDocxTextFromBuffer(
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}
