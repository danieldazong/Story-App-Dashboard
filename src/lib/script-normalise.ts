/**
 * Cleans extracted prose once, at ingestion, rather than papering over it at
 * render time.
 *
 * Runs server-side only (see app/actions/scripts.ts). Keeping it a pure
 * function of its input means the rules can be probed directly rather than
 * inferred from a rendered page — the same discipline applied to
 * lib/script-markup.ts, where a regex parser typechecked cleanly while being
 * wrong.
 */

/**
 * Markdown the editor and the mobile reader both consume.
 *
 * `**bold**`, `_italic_` and `## heading` survive normalisation untouched.
 * Stripping or escaping them would silently destroy formatting an operator
 * applied, and would desync the preview from what the reader renders.
 */

export type NormaliseOptions = {
  /** Used to strip a leading heading that merely repeats it. */
  chapterNumber?: number;
  /** Used to strip a leading heading that merely repeats it. */
  chapterTitle?: string;
};

/**
 * True when a line is just this chapter announcing itself.
 *
 * Matches `Chapter 7`, `CHAPTER VII`, `7.`, the chapter's own title, or a
 * `## `-prefixed version of any of those. The reader renders its own heading,
 * so keeping this duplicates it on every screen.
 *
 * Deliberately conservative: it only strips a line that is *nothing but* the
 * chapter's identity. A line like "Chapter 7 began badly" is prose and stays.
 */
function isRedundantHeading(
  line: string,
  { chapterNumber, chapterTitle }: NormaliseOptions,
): boolean {
  const bare = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_]/g, "")
    .trim()
    .replace(/[.:—–-]+$/, "")
    .trim();

  if (bare === "") return false;

  if (chapterTitle && bare.toLowerCase() === chapterTitle.trim().toLowerCase()) {
    return true;
  }

  if (chapterNumber !== undefined) {
    const numeric = new RegExp(`^chapter\\s+0*${chapterNumber}$`, "i");
    if (numeric.test(bare)) return true;
    if (new RegExp(`^0*${chapterNumber}$`).test(bare)) return true;
  }

  return false;
}

/**
 * Normalises extracted text for storage.
 *
 * Order matters: line endings first so everything downstream can assume `\n`,
 * then per-line trimming, then the heading strip (which needs to see the first
 * non-empty line), then blank-line collapsing last so removals cannot leave a
 * run of blanks behind.
 */
export function normaliseScriptText(
  raw: string,
  options: NormaliseOptions = {},
): string {
  // CRLF and lone CR both become LF. Word and older editors emit both.
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  // Trailing whitespace carries no meaning in prose and shows up as ragged
  // diffs later. Leading whitespace is left alone — it may be deliberate.
  const trimmed = lines.map((line) => line.replace(/[ \t]+$/, ""));

  // Strip a leading heading only if it is the FIRST non-empty line. A repeated
  // title deeper in the text is prose, not a heading.
  let start = 0;
  while (start < trimmed.length && trimmed[start].trim() === "") start += 1;
  if (start < trimmed.length && isRedundantHeading(trimmed[start], options)) {
    trimmed.splice(start, 1);
  }

  // Three or more consecutive blank lines become one. Two blank lines already
  // read as a scene break and are preserved.
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of trimmed) {
    if (line.trim() === "") {
      blankRun += 1;
      if (blankRun <= 1) collapsed.push("");
      continue;
    }
    blankRun = 0;
    collapsed.push(line);
  }

  return collapsed.join("\n").trim();
}

/**
 * Whether an extraction produced anything worth storing.
 *
 * An empty `script_text` must mean "no script", never "a script that failed to
 * parse" — the two are indistinguishable to every screen that reads presence
 * from nullability, and conflating them would show a chapter as complete when
 * its prose silently vanished.
 */
export function hasReadableText(text: string): boolean {
  return text.trim() !== "";
}
