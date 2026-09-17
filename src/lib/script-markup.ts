/**
 * The tiny subset of Markdown the Chapter editor's toolbar can produce.
 *
 * Deliberately hand-rolled rather than pulling in a Markdown library: the
 * toolbar emits exactly three marks (`**bold**`, `_italic_`, `## heading`), and
 * a full CommonMark parser would bring a dependency, a much larger surface of
 * syntax the reader app may not support, and a decision nobody asked for.
 * AGENTS.md also requires approval before adding a library — this needed none.
 *
 * IMPORTANT: `script_text` is stored as plain Markdown because the mobile reader
 * consumes that column directly (see the RLS migration). Nothing here changes
 * what is stored; this only renders a preview of it. Do not "upgrade" the editor
 * to emit HTML without confirming the reader can parse it.
 */

export type ScriptBlock =
  | { kind: "heading"; spans: ScriptSpan[] }
  | { kind: "paragraph"; spans: ScriptSpan[] };

export type ScriptSpan = {
  text: string;
  bold: boolean;
  italic: boolean;
};

/**
 * Splits one line into bold/italic spans.
 *
 * `**` is matched before `_` so that `**bold _and italic_**` nests correctly
 * rather than the underscore stealing the inner run. Unmatched markers are left
 * as literal text: a lone `**` is far more likely to be prose the author typed
 * than a formatting mistake worth hiding.
 */
function parseSpans(line: string): ScriptSpan[] {
  const spans: ScriptSpan[] = [];
  const pattern = /\*\*(.+?)\*\*|_(.+?)_/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      spans.push({
        text: line.slice(lastIndex, match.index),
        bold: false,
        italic: false,
      });
    }

    if (match[1] !== undefined) {
      // Bold run — may itself contain an italic run.
      for (const inner of parseSpans(match[1])) {
        spans.push({ ...inner, bold: true });
      }
    } else if (match[2] !== undefined) {
      spans.push({ text: match[2], bold: false, italic: true });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < line.length) {
    spans.push({ text: line.slice(lastIndex), bold: false, italic: false });
  }

  return spans;
}

/**
 * Parses script text into renderable blocks.
 *
 * Returns data, not HTML. The preview renders these as React elements, so the
 * operator's prose is never passed through `dangerouslySetInnerHTML` and cannot
 * inject markup — which matters because this text arrives from uploaded DOCX
 * files and pasted clipboard content, neither of which is trusted input.
 *
 * Blank lines separate paragraphs, matching how the prose already reads in the
 * textarea.
 */
export function parseScript(text: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseSpans(paragraph.join(" ")) });
    paragraph = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === "") {
      flush();
      continue;
    }

    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", spans: parseSpans(heading[1]) });
      continue;
    }

    paragraph.push(line);
  }

  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Toolbar state
// ---------------------------------------------------------------------------

export type Mark = "bold" | "italic" | "heading";

const WRAPPERS: Record<"bold" | "italic", string> = {
  bold: "**",
  italic: "_",
};

/**
 * Whether a selection already carries a mark, so the toolbar button can show as
 * active and a second click can remove it.
 *
 * Checks two shapes: the selection is exactly the marked text (`|wanted|` with
 * `**` either side of it), or the selection includes its own markers
 * (`|**wanted**|`). Operators select both ways and neither should re-wrap.
 */
export function hasMark(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  mark: Mark,
): boolean {
  if (mark === "heading") {
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    return /^##\s/.test(value.slice(lineStart));
  }

  const wrap = WRAPPERS[mark];
  const selected = value.slice(selectionStart, selectionEnd);

  if (selected.startsWith(wrap) && selected.endsWith(wrap) && selected.length > wrap.length * 2) {
    return true;
  }

  return (
    value.slice(selectionStart - wrap.length, selectionStart) === wrap &&
    value.slice(selectionEnd, selectionEnd + wrap.length) === wrap
  );
}

export type MarkResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

/**
 * Adds a mark to the selection, or removes it when already present.
 *
 * Toggling off is what makes the toolbar behave like a real editor: clicking
 * Bold on already-bold text previously produced `****text****`, which renders as
 * literal asterisks around bold text.
 */
export function toggleMark(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  mark: Mark,
): MarkResult {
  if (mark === "heading") {
    return toggleHeading(value, selectionStart, selectionEnd);
  }

  const wrap = WRAPPERS[mark];
  const selected = value.slice(selectionStart, selectionEnd);

  // Selection includes the markers: strip them from inside the selection.
  if (
    selected.startsWith(wrap) &&
    selected.endsWith(wrap) &&
    selected.length > wrap.length * 2
  ) {
    const inner = selected.slice(wrap.length, selected.length - wrap.length);
    return {
      value: value.slice(0, selectionStart) + inner + value.slice(selectionEnd),
      selectionStart,
      selectionEnd: selectionStart + inner.length,
    };
  }

  // Markers sit just outside the selection: remove them from around it.
  if (
    value.slice(selectionStart - wrap.length, selectionStart) === wrap &&
    value.slice(selectionEnd, selectionEnd + wrap.length) === wrap
  ) {
    return {
      value:
        value.slice(0, selectionStart - wrap.length) +
        selected +
        value.slice(selectionEnd + wrap.length),
      selectionStart: selectionStart - wrap.length,
      selectionEnd: selectionEnd - wrap.length,
    };
  }

  return {
    value:
      value.slice(0, selectionStart) +
      wrap +
      selected +
      wrap +
      value.slice(selectionEnd),
    selectionStart: selectionStart + wrap.length,
    selectionEnd: selectionEnd + wrap.length,
  };
}

/** `## ` is a line prefix, not a wrapper, so it toggles on the whole line. */
function toggleHeading(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): MarkResult {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const existing = /^##\s/.exec(value.slice(lineStart));

  if (existing) {
    const width = existing[0].length;
    return {
      value: value.slice(0, lineStart) + value.slice(lineStart + width),
      selectionStart: Math.max(lineStart, selectionStart - width),
      selectionEnd: Math.max(lineStart, selectionEnd - width),
    };
  }

  return {
    value: value.slice(0, lineStart) + "## " + value.slice(lineStart),
    selectionStart: selectionStart + 3,
    selectionEnd: selectionEnd + 3,
  };
}
