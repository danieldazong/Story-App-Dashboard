/**
 * Filename parsing and batch conflict evaluation for bulk script import.
 *
 * Pure: no React, no I/O, no Supabase. That matters because both the client
 * (rendering the preview) and the server (re-checking during preflight) call
 * `evaluateBatch`, and the preview must never disagree with what the import
 * actually does.
 *
 * Deliberately NOT lib/manuscript.ts. That module splits ONE file's contents at
 * detected headings; this one reads MANY filenames and resolves conflicts
 * between them. Same domain, no shared logic — merging them would couple a
 * content parser to a filename parser for the sake of a shared folder.
 */

export type ParsedFileName = {
  /** Null when the name carries no detectable chapter number. */
  number: number | null;
  title: string;
};

export type BatchRowStatus =
  | "new_chapter"
  | "replaces_script"
  | "no_number"
  | "duplicate_number"
  | "unreadable_file";

export type BatchInputRow = {
  /** Stable per-file identity, so edits survive re-evaluation and re-sorting. */
  id: string;
  fileName: string;
  sizeBytes: number;
  /**
   * Operator overrides from the editable CHAPTER # / TITLE cells. Undefined
   * means "use whatever the filename parsed to".
   */
  numberOverride?: number | null;
  titleOverride?: string;
  /** Set when the file could not be read or produced no text. */
  unreadable?: boolean;
  /** Word count, when the file was read client-side for the preview. */
  wordCount?: number | null;
};

export type BatchRow = {
  id: string;
  fileName: string;
  sizeBytes: number;
  number: number;
  title: string;
  wordCount: number | null;
  status: BatchRowStatus;
  /** True when this row cannot be imported until the operator resolves it. */
  blocked: boolean;
};

const EXTENSION = /\.[^.]+$/;

/**
 * Separators operators actually produce between a chapter number and its title:
 * underscores, hyphens, en/em dashes, dots, and runs of spaces.
 */
const SEPARATORS = /[\s._\-–—]+/;

/**
 * Leading chapter-number patterns, most specific first.
 *
 * Order matters. `chapter-12-the-rejection` must match the `chapter` form
 * before the bare-leading-number form gets a chance, or it would parse the
 * number out of "12" while leaving "chapter" stranded in the title.
 */
const NUMBER_PATTERNS: RegExp[] = [
  // "chapter 12 - title", "chapter-12_title", "Chapter12 title"
  /^chapter[\s._\-–—]*(\d+)(?:[\s._\-–—]+(.*))?$/i,
  // "ch12_title", "ch-12-title", "ch 12 title"
  /^ch[\s._\-–—]*(\d+)(?:[\s._\-–—]+(.*))?$/i,
  // "12 - title", "012_title", "12.title"
  /^(\d+)(?:[\s._\-–—]+(.*))?$/,
];

/** Words kept lowercase in title case, except in first position. */
const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "the",
  "to",
  "up",
  "vs",
]);

/**
 * Title-cases a separator-normalised string.
 *
 * Words already containing an uppercase letter are left ALONE — an operator who
 * named a file `ch12_MacGregor returns.docx` meant `MacGregor`, and
 * lowercasing it to re-capitalise would produce `Macgregor`. Only fully
 * lowercase words are transformed.
 */
function toTitleCase(input: string): string {
  const words = input.split(/\s+/).filter((word) => word !== "");

  return words
    .map((word, index) => {
      if (/[A-Z]/.test(word)) return word;
      if (index > 0 && MINOR_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Derives a chapter number and title from a file name.
 *
 * Contract (from prompt 10, and the probe suite):
 *   ch12_rejection.docx           -> 12,   "Rejection"
 *   chapter-12-the-rejection.txt  -> 12,   "The Rejection"
 *   12 - The Rejection.docx       -> 12,   "The Rejection"
 *   012_the_rejection.md          -> 12,   "The Rejection"
 *   The Rejection.txt             -> null, "The Rejection"
 */
export function parseFileName(fileName: string): ParsedFileName {
  const stem = fileName.replace(EXTENSION, "").trim();

  for (const pattern of NUMBER_PATTERNS) {
    const match = stem.match(pattern);
    if (!match) continue;

    // Leading zeroes are formatting, not value: `012` is chapter 12.
    const number = Number.parseInt(match[1], 10);
    if (!Number.isFinite(number)) continue;

    const rest = (match[2] ?? "").replace(SEPARATORS, " ").trim();
    return {
      number,
      title: rest === "" ? `Chapter ${number}` : toTitleCase(rest),
    };
  }

  const title = stem.replace(SEPARATORS, " ").trim();
  return { number: null, title: title === "" ? "Untitled" : toTitleCase(title) };
}

/**
 * Resolves a batch of parsed files against a book's existing chapters.
 *
 * Deterministic: the same inputs always produce the same output, which is what
 * lets the client preview and the server preflight agree. Both call this.
 *
 * Unnumbered rows are assigned sequential numbers continuing from
 * `highestExisting`, in the order they were given — so a folder of
 * `The Rejection.txt`-style names imports in drop order rather than at random.
 */
export function evaluateBatch(
  rows: BatchInputRow[],
  existingNumbers: number[],
  highestExisting: number,
): BatchRow[] {
  const existing = new Set(existingNumbers);

  // Numbers already claimed by THIS batch, so an auto-assigned number cannot
  // collide with one an operator typed explicitly.
  const claimed = new Set<number>();
  for (const row of rows) {
    const explicit =
      row.numberOverride ?? parseFileName(row.fileName).number ?? null;
    if (explicit !== null) claimed.add(explicit);
  }

  let nextAuto = highestExisting;
  function allocate(): number {
    do {
      nextAuto += 1;
    } while (existing.has(nextAuto) || claimed.has(nextAuto));
    claimed.add(nextAuto);
    return nextAuto;
  }

  // First pass: resolve each row's effective number and title.
  const resolved = rows.map((row) => {
    const parsed = parseFileName(row.fileName);
    const number = row.numberOverride ?? parsed.number;
    const title = (row.titleOverride ?? parsed.title).trim();

    return {
      row,
      parsedNumber: parsed.number,
      number: number === null ? allocate() : number,
      // An override that is blanked out falls back rather than importing a
      // chapter with no title at all.
      title: title === "" ? parsed.title : title,
      // Only rows with no number from EITHER source need operator attention.
      // An auto-assigned number is a suggestion, not a resolution.
      needsNumber: number === null,
    };
  });

  // Second pass: duplicates within the batch. Counted across resolved numbers,
  // so two rows that separately parsed to 12 collide even though neither was
  // edited.
  const counts = new Map<number, number>();
  for (const entry of resolved) {
    counts.set(entry.number, (counts.get(entry.number) ?? 0) + 1);
  }

  const evaluated: BatchRow[] = resolved.map((entry) => {
    const { row } = entry;

    const status: BatchRowStatus = row.unreadable
      ? "unreadable_file"
      : (counts.get(entry.number) ?? 0) > 1
        ? "duplicate_number"
        : entry.needsNumber
          ? "no_number"
          : existing.has(entry.number)
            ? "replaces_script"
            : "new_chapter";

    return {
      id: row.id,
      fileName: row.fileName,
      sizeBytes: row.sizeBytes,
      number: entry.number,
      title: entry.title,
      wordCount: row.wordCount ?? null,
      status,
      blocked:
        status === "unreadable_file" ||
        status === "duplicate_number" ||
        status === "no_number",
    };
  });

  // Unnumbered rows first so they demand attention, then by chapter number.
  // Stable within each group by original order.
  return evaluated.sort((a, b) => {
    const aNeeds = a.status === "no_number" ? 0 : 1;
    const bNeeds = b.status === "no_number" ? 0 : 1;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    return a.number - b.number;
  });
}

/** Whether a row may be imported. Blocked rows can never be checked. */
export function isImportable(row: BatchRow): boolean {
  return !row.blocked;
}

/**
 * Rows that start checked.
 *
 * `replaces_script` starts UNCHECKED even though it is importable: overwriting
 * existing chapter text must be deliberate, not the default.
 */
export function startsChecked(row: BatchRow): boolean {
  return isImportable(row) && row.status !== "replaces_script";
}

export type BatchSummary = {
  newChapters: number;
  replacing: number;
  blocked: number;
  excluded: number;
};

export function summariseBatch(
  rows: BatchRow[],
  checkedIds: ReadonlySet<string>,
): BatchSummary {
  let newChapters = 0;
  let replacing = 0;
  let blocked = 0;
  let excluded = 0;

  for (const row of rows) {
    if (row.blocked) {
      blocked += 1;
      continue;
    }
    if (!checkedIds.has(row.id)) {
      excluded += 1;
      continue;
    }
    if (row.status === "replaces_script") replacing += 1;
    else newChapters += 1;
  }

  return { newChapters, replacing, blocked, excluded };
}
