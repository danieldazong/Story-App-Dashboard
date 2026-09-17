import type { Database } from "@/types/database";

// Row and enum shapes come from the generated types (types/database.ts, never
// hand-edited). Nothing below redeclares a primitive the database already
// defines — see AGENTS.md, TypeScript Rules.
type BookRow = Database["public"]["Tables"]["books"]["Row"];
type ChapterRow = Database["public"]["Tables"]["chapters"]["Row"];
type Enums = Database["public"]["Enums"];

export type BookStatus = Enums["book_status"];

// Value is `mature_17`; every UI surface labels it "Mature 18+". That mismatch
// is deliberate — see AGENTS.md, Known design-file defects.
export type Maturity = Enums["maturity"];

export type ChapterAccess = Enums["chapter_access"];

export type DurationSource = Enums["duration_source"];

// The asset unions below model as discriminated state what the database stores
// as nullable columns (`cover_path is null`, `script_text is null`,
// `audio_path is null`). That is the one place the app type and the row type
// deliberately diverge: the database expresses absence as null, the UI needs an
// exhaustive `missing | ready` split so no branch can be forgotten. Their field
// types still derive from the row rather than being redeclared.
export type CoverAsset =
  | { state: "missing" }
  | {
      state: "ready";
      fileName: NonNullable<BookRow["cover_file_name"]>;
      sizeBytes: NonNullable<BookRow["cover_size_bytes"]>;
      url: string;
      width: NonNullable<BookRow["cover_width"]>;
      height: NonNullable<BookRow["cover_height"]>;
    };

export type Book = {
  id: BookRow["id"];
  title: BookRow["title"];
  author: BookRow["author"];
  shortDescription: NonNullable<BookRow["short_description"]>;
  synopsis: NonNullable<BookRow["synopsis"]>;
  genres: BookRow["genres"];
  maturity: Maturity;
  status: BookStatus;
  cover: CoverAsset;
  defaultChapterAccess: ChapterAccess;
  createdAt: BookRow["created_at"];
  updatedAt: BookRow["updated_at"];
};

export type ScriptAsset =
  | { state: "missing" }
  | {
      state: "ready";
      fileName: NonNullable<ChapterRow["script_file_name"]>;
      text: NonNullable<ChapterRow["script_text"]>;
      // Derived from `script_text` at render time via `countWords`, never
      // persisted — there is deliberately no word_count column.
      wordCount: number;
    };

export type AudioAsset =
  | { state: "missing" }
  | {
      state: "ready";
      fileName: NonNullable<ChapterRow["audio_file_name"]>;
      sizeBytes: NonNullable<ChapterRow["audio_size_bytes"]>;
      durationSeconds: NonNullable<ChapterRow["audio_duration_seconds"]>;
      durationSource: DurationSource;
      url: string;
    };

export type Chapter = {
  id: ChapterRow["id"];
  bookId: ChapterRow["book_id"];
  number: ChapterRow["number"];
  title: ChapterRow["title"];
  script: ScriptAsset;
  audio: AudioAsset;
  access: ChapterAccess;
  updatedAt: ChapterRow["updated_at"];
};

// NOT derived from the `chapters_needing_attention` view, deliberately.
//
// The view's `missing` column generates as `string | null`: Postgres types a
// bare `case` expression as `text`, so the generator cannot narrow it to these
// three values, and every view column is nullable because Postgres cannot prove
// non-nullability across a join (even though the view's own `where` clause
// guarantees a row only appears when at least one asset is absent).
//
// Deriving from the view would therefore *widen* this type to `string | null`
// and lose exhaustiveness checking at every call site. The union stays
// hand-declared and must be kept in step with the view's `case` expression in
// supabase/migrations/..._chapters_needing_attention_view.sql and with
// `chapterMissingAsset()` in lib/catalog.ts.
export type MissingAsset = "script" | "audio" | "both";

export type ActivityEntry = {
  id: string;
  timestamp: string;
  message: string;
};
