import { countWords } from "@/lib/catalog";

const SPELLED_NUMBERS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twenty-one",
  "twenty-two",
  "twenty-three",
  "twenty-four",
  "twenty-five",
  "twenty-six",
  "twenty-seven",
  "twenty-eight",
  "twenty-nine",
  "thirty",
  "thirty-one",
  "thirty-two",
  "thirty-three",
  "thirty-four",
  "thirty-five",
  "thirty-six",
  "thirty-seven",
  "thirty-eight",
  "thirty-nine",
  "forty",
  "forty-one",
  "forty-two",
  "forty-three",
  "forty-four",
  "forty-five",
  "forty-six",
  "forty-seven",
  "forty-eight",
  "forty-nine",
  "fifty",
];

const SPELLED_NUMBER_PATTERN = SPELLED_NUMBERS.map((word) =>
  word.replace("-", "[\\s-]"),
).join("|");

export type ManuscriptSection = {
  number: number;
  title: string;
  body: string;
  confident: boolean;
};

export type ManuscriptSplit = {
  sections: ManuscriptSection[];
};

function spelledToNumber(word: string): number {
  const normalized = word.toLowerCase().replace(/\s+/g, "-");
  const index = SPELLED_NUMBERS.indexOf(normalized);
  return index === -1 ? 0 : index + 1;
}

function matchHeading(
  line: string,
): { number: number | null; title: string } | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;

  const numericMatch = trimmed.match(/^chapter\s+(\d+)\b\s*[:.\-—]?\s*(.*)$/i);
  if (numericMatch) {
    return {
      number: Number(numericMatch[1]),
      title: numericMatch[2]?.trim() ?? "",
    };
  }

  const spelledMatch = trimmed.match(
    new RegExp(`^chapter\\s+(${SPELLED_NUMBER_PATTERN})\\b\\s*[:.\\-—]?\\s*(.*)$`, "i"),
  );
  if (spelledMatch) {
    return {
      number: spelledToNumber(spelledMatch[1]),
      title: spelledMatch[2]?.trim() ?? "",
    };
  }

  const dotDashMatch = trimmed.match(/^(\d+)\s*[.\-—]\s*(.*)$/);
  if (dotDashMatch) {
    return {
      number: Number(dotDashMatch[1]),
      title: dotDashMatch[2]?.trim() ?? "",
    };
  }

  const markdownMatch = trimmed.match(/^#{1,2}\s+(.*)$/);
  if (markdownMatch) {
    return { number: null, title: markdownMatch[1].trim() };
  }

  return null;
}

export function splitManuscript(text: string): ManuscriptSplit {
  const lines = text.split(/\r\n|\r|\n/);

  type RawSection = { heading: ReturnType<typeof matchHeading>; lines: string[] };
  const rawSections: RawSection[] = [];

  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading) {
      rawSections.push({ heading, lines: [] });
    } else if (rawSections.length > 0) {
      rawSections[rawSections.length - 1].lines.push(line);
    }
  }

  const sections: ManuscriptSection[] = rawSections.map((raw, index) => {
    const body = raw.lines.join("\n").trim();
    const number = raw.heading?.number ?? index + 1;
    const title = raw.heading?.title || `Chapter ${number}`;
    return {
      number,
      title,
      body,
      confident: raw.heading?.number !== null,
    };
  });

  return { sections };
}

export function manuscriptSectionWordCount(section: ManuscriptSection): number {
  return countWords(section.body);
}
