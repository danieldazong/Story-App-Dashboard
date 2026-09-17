// Development fixture. Replaced by Supabase reads in a later prompt.
// Every ratio, count and total derived from this data must be computed
// through the helpers in `lib/catalog.ts` — never stored or hand-typed here.

import type { Book, Chapter } from "@/types/catalog";
import { countWords } from "@/lib/catalog";

const PARAGRAPH_ONE =
  "The moon hung low over Blackridge Hollow, and Elena knew better than to be outside when it did. The pack law was simple: after dark, the streets belonged to the wolves. But her sister was still missing, and laws had never protected the people she loved.";

const PARAGRAPH_TWO =
  "She pressed herself against the cold brick of the alley wall, listening to the low growl carried on the wind. It wasn't an animal sound. It was something closer to a warning, deliberate and aimed at her alone. Somewhere behind that growl was a man who used to smile at her across the dinner table.";

const PARAGRAPH_THREE =
  "When he finally stepped into the light, his eyes were still gold, still wild, but his voice was achingly familiar. \"You shouldn't have come looking for me,\" he said. \"Not tonight, and not like this.\" Elena didn't move. She had come too far to run now.";

function scriptText(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

function readyScript(fileName: string, paragraphs: string[]) {
  const text = scriptText(paragraphs);
  return {
    state: "ready" as const,
    fileName,
    text,
    wordCount: countWords(text),
  };
}

const missingScript = { state: "missing" as const };
const missingAudio = { state: "missing" as const };

function readyAudio(
  fileName: string,
  sizeBytes: number,
  durationSeconds: number,
  durationSource: "detected" | "manual" = "detected",
) {
  return {
    state: "ready" as const,
    fileName,
    sizeBytes,
    durationSeconds,
    durationSource,
    url: `https://cdn.novelnow.app/audio/${fileName}`,
  };
}

function readyCover(
  fileName: string,
  sizeBytes: number,
  url: string,
  width = 848,
  height = 1264,
) {
  return {
    state: "ready" as const,
    fileName,
    sizeBytes,
    url,
    width,
    height,
  };
}

export const BOOK_A: Book = {
  id: "book-a",
  title: "The Alpha King's Ugly Bride",
  author: "Elara Kingsley",
  shortDescription:
    "Cursed with a face the pack calls monstrous, Mira is traded to the Alpha King to settle her father's debts.",
  synopsis:
    "When Mira is handed over as payment for her father's failed harvest, she expects cruelty from the Alpha King. What she finds instead is a man fighting his own curse — one that might be tied to hers.",
  genres: ["werewolf", "possessive_alpha", "romance"],
  maturity: "mature_17",
  status: "published",
  cover: readyCover(
    "the-alpha-kings-ugly-bride-cover.jpg",
    248_982,
    "/images/covers/the-alpha-kings-ugly-bride-cover.jpg",
  ),
  defaultChapterAccess: "locked",
  createdAt: "2026-06-01T09:00:00.000Z",
  updatedAt: "2026-09-14T14:30:00.000Z",
};

export const BOOK_A_CHAPTERS: Chapter[] = [
  {
    id: "book-a-ch-1",
    bookId: "book-a",
    number: 1,
    title: "The Debt",
    script: readyScript("chapter-01-the-debt.docx", [
      PARAGRAPH_ONE,
      PARAGRAPH_TWO,
    ]),
    audio: readyAudio("chapter-01-the-debt.m4a", 5_420_000, 312),
    access: "free",
    updatedAt: "2026-06-02T10:00:00.000Z",
  },
  {
    id: "book-a-ch-2",
    bookId: "book-a",
    number: 2,
    title: "A Face Like Mine",
    script: readyScript("chapter-02-a-face-like-mine.docx", [
      PARAGRAPH_TWO,
      PARAGRAPH_THREE,
    ]),
    audio: readyAudio("chapter-02-a-face-like-mine.m4a", 5_180_000, 298),
    access: "free",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
  {
    id: "book-a-ch-3",
    bookId: "book-a",
    number: 3,
    title: "The Howl at Dusk",
    script: readyScript("chapter-03-the-howl-at-dusk.docx", [
      PARAGRAPH_ONE,
      PARAGRAPH_THREE,
    ]),
    audio: readyAudio("chapter-03-the-howl-at-dusk.m4a", 5_960_000, 334),
    access: "free",
    updatedAt: "2026-06-04T10:00:00.000Z",
  },
  {
    id: "book-a-ch-4",
    bookId: "book-a",
    number: 4,
    title: "Bound by Silver",
    script: readyScript("chapter-04-bound-by-silver.docx", [
      PARAGRAPH_ONE,
      PARAGRAPH_TWO,
      PARAGRAPH_THREE,
    ]),
    audio: readyAudio("chapter-04-bound-by-silver.m4a", 6_240_000, 356),
    access: "locked",
    updatedAt: "2026-06-05T10:00:00.000Z",
  },
  {
    id: "book-a-ch-5",
    bookId: "book-a",
    number: 5,
    title: "A Debt Repaid",
    script: readyScript("chapter-05-a-debt-repaid.docx", [
      PARAGRAPH_TWO,
      PARAGRAPH_ONE,
    ]),
    audio: readyAudio("chapter-05-a-debt-repaid.m4a", 5_020_000, 289),
    access: "locked",
    updatedAt: "2026-06-06T10:00:00.000Z",
  },
  {
    id: "book-a-ch-6",
    bookId: "book-a",
    number: 6,
    title: "The King's Chambers",
    script: readyScript("chapter-06-the-kings-chambers.docx", [
      PARAGRAPH_THREE,
      PARAGRAPH_ONE,
    ]),
    audio: readyAudio("chapter-06-the-kings-chambers.m4a", 5_540_000, 318),
    access: "locked",
    updatedAt: "2026-06-07T10:00:00.000Z",
  },
  {
    id: "book-a-ch-7",
    bookId: "book-a",
    number: 7,
    title: "Beneath the Obsidian Keep",
    script: readyScript("chapter-07-beneath-the-obsidian-keep.docx", [
      PARAGRAPH_ONE,
      PARAGRAPH_TWO,
    ]),
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-06-08T10:00:00.000Z",
  },
  {
    id: "book-a-ch-8",
    bookId: "book-a",
    number: 8,
    title: "Silver Chains",
    script: missingScript,
    audio: readyAudio("chapter-08-silver-chains.m4a", 5_760_000, 327),
    access: "locked",
    updatedAt: "2026-06-09T10:00:00.000Z",
  },
  {
    id: "book-a-ch-9",
    bookId: "book-a",
    number: 9,
    title: "What the Moon Remembers",
    script: missingScript,
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-06-10T10:00:00.000Z",
  },
  {
    id: "book-a-ch-10",
    bookId: "book-a",
    number: 10,
    title: "The Truth About the Curse",
    script: readyScript("chapter-10-the-truth-about-the-curse.docx", [
      PARAGRAPH_THREE,
      PARAGRAPH_TWO,
      PARAGRAPH_ONE,
    ]),
    audio: readyAudio(
      "chapter-10-the-truth-about-the-curse.m4a",
      6_080_000,
      344,
      "manual",
    ),
    access: "locked",
    updatedAt: "2026-06-11T10:00:00.000Z",
  },
  {
    id: "book-a-ch-11",
    bookId: "book-a",
    number: 11,
    title: "Where the River Bends and the Old Road Ends",
    script: readyScript(
      "chapter-11-where-the-river-bends-and-the-old-road-ends.docx",
      [PARAGRAPH_ONE, PARAGRAPH_TWO, PARAGRAPH_THREE],
    ),
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-06-12T10:00:00.000Z",
  },
  {
    id: "book-a-ch-12",
    bookId: "book-a",
    number: 12,
    title: "A Crown of Thorns",
    script: readyScript("chapter-12-a-crown-of-thorns.docx", [
      PARAGRAPH_TWO,
      PARAGRAPH_THREE,
    ]),
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-06-13T10:00:00.000Z",
  },
];

export const BOOK_B: Book = {
  id: "book-b",
  title: "Eternal Eclipse: A Tale of Forbidden Magic",
  author: "Rowan Ashcroft",
  shortDescription:
    "A witch bound to secrecy and a vampire prince bound to duty collide when an ancient eclipse ritual goes wrong.",
  synopsis:
    "Every hundred years, the eclipse ritual keeps two warring courts at peace. When Ysolde is chosen against her will to perform it alongside Prince Kael, the ritual reveals a bond neither court sanctioned.",
  genres: ["vampire", "fantasy", "paranormal"],
  maturity: "mature_17",
  status: "published",
  cover: readyCover(
    "eternal-eclipse-cover.jpg",
    277_701,
    "/images/covers/eternal-eclipse-cover.jpg",
  ),
  defaultChapterAccess: "locked",
  createdAt: "2026-04-10T09:00:00.000Z",
  updatedAt: "2026-09-15T10:15:00.000Z",
};

export const BOOK_B_CHAPTERS: Chapter[] = Array.from(
  { length: 40 },
  (_, index) => {
    const number = index + 1;
    const paragraphs = [PARAGRAPH_ONE, PARAGRAPH_TWO, PARAGRAPH_THREE].slice(
      0,
      2 + (number % 2),
    );
    return {
      id: `book-b-ch-${number}`,
      bookId: "book-b",
      number,
      title: `Eclipse, Part ${number}`,
      script: readyScript(
        `chapter-${String(number).padStart(2, "0")}-eclipse-part-${number}.docx`,
        paragraphs,
      ),
      audio: readyAudio(
        `chapter-${String(number).padStart(2, "0")}-eclipse-part-${number}.m4a`,
        5_000_000 + number * 12_000,
        280 + number * 3,
      ),
      access: number <= 3 ? "free" : "locked",
      updatedAt: new Date(2026, 3, 10 + number).toISOString(),
    } satisfies Chapter;
  },
);

export const BOOK_C: Book = {
  id: "book-c",
  title: "Bound to the Midnight Heir",
  author: "Sable Winters",
  shortDescription:
    "An orphaned seer is betrothed to the heir of a dying vampire court she was raised to destroy.",
  synopsis:
    "Raised by hunters to end the Midnight Court's bloodline, Wren is instead bound to it by an ancient betrothal contract. Now she must decide whether her mission or her mark matters more.",
  genres: ["vampire", "dark_romance", "enemies_to_lovers"],
  maturity: "mature_17",
  status: "draft",
  cover: readyCover(
    "bound-to-the-midnight-heir-cover.jpg",
    238_594,
    "/images/covers/bound-to-the-midnight-heir-cover.jpg",
  ),
  defaultChapterAccess: "locked",
  createdAt: "2026-09-13T18:50:00.000Z",
  updatedAt: "2026-09-13T18:50:00.000Z",
};

export const BOOK_C_CHAPTERS: Chapter[] = [
  {
    id: "book-c-ch-1",
    bookId: "book-c",
    number: 1,
    title: "The Blood Oath",
    script: missingScript,
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-09-13T18:50:00.000Z",
  },
  {
    id: "book-c-ch-2",
    bookId: "book-c",
    number: 2,
    title: "Shadows in the Mist",
    script: missingScript,
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-09-13T18:50:00.000Z",
  },
  {
    id: "book-c-ch-3",
    bookId: "book-c",
    number: 3,
    title: "Marked by Midnight",
    script: missingScript,
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-09-13T18:50:00.000Z",
  },
  {
    id: "book-c-ch-4",
    bookId: "book-c",
    number: 4,
    title: "A Contract in Blood",
    script: missingScript,
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-09-13T18:50:00.000Z",
  },
  {
    id: "book-c-ch-5",
    bookId: "book-c",
    number: 5,
    title: "The Hunter's Daughter",
    script: missingScript,
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-09-13T18:50:00.000Z",
  },
  {
    id: "book-c-ch-6",
    bookId: "book-c",
    number: 6,
    title: "What the Court Demands",
    script: missingScript,
    audio: missingAudio,
    access: "locked",
    updatedAt: "2026-09-13T18:50:00.000Z",
  },
];

export const MOCK_BOOKS: Book[] = [BOOK_A, BOOK_B, BOOK_C];

export const MOCK_CHAPTERS: Chapter[] = [
  ...BOOK_A_CHAPTERS,
  ...BOOK_B_CHAPTERS,
  ...BOOK_C_CHAPTERS,
];
