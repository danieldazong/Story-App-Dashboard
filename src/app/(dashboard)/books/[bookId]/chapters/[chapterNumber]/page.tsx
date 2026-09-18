import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { ChapterEditor } from "@/components/chapters/chapter-editor";
import { QueryErrorCard } from "@/components/shell/query-error-card";
import { serverSupabaseWithSettings } from "@/lib/server-supabase";
import { getBook, getChapter, getChapterNeighbours } from "@/lib/queries";

export default async function ChapterEditorPage({
  params,
}: {
  params: Promise<{ bookId: string; chapterNumber: string }>;
}) {
  const { bookId, chapterNumber } = await params;
  const number = Number(chapterNumber);
  const { client, settings } = await serverSupabaseWithSettings();

  const bookResult = await getBook(client, bookId, settings.publicCdnDomain);

  if (!bookResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[{ label: "Books", href: "/books" }, { label: "Error" }]}
        />
        <QueryErrorCard
          message={bookResult.error}
          kind={bookResult.kind}
          retryHref={`/books/${bookId}/chapters/${chapterNumber}`}
        />
      </div>
    );
  }

  const book = bookResult.data;

  // A missing BOOK on a chapter route is still a 404 — the chapter cannot exist
  // without it. Only the genuinely-absent case reaches here; a failed read took
  // the QueryErrorCard branch above.
  if (!book) notFound();

  const chapterResult = await getChapter(client, book.id, number);

  if (!chapterResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumbs
          items={[
            { label: "Books", href: "/books" },
            { label: book.title, href: `/books/${book.id}` },
            { label: "Error" },
          ]}
        />
        <QueryErrorCard
          message={chapterResult.error}
          kind={chapterResult.kind}
          retryHref={`/books/${bookId}/chapters/${chapterNumber}`}
        />
      </div>
    );
  }

  // Chapters are persisted now (prompt 14), so a miss here means the chapter
  // genuinely does not exist — there is no local-only state to fall back to.
  if (!chapterResult.data) notFound();

  const neighbours = await getChapterNeighbours(client, book.id, number);
  const previous = neighbours.ok ? neighbours.data.previous : null;
  const next = neighbours.ok ? neighbours.data.next : null;

  return (
    <ChapterEditor
      bookId={book.id}
      bookTitle={book.title}
      chapter={chapterResult.data}
      previousHref={
        previous !== null ? `/books/${book.id}/chapters/${previous}` : null
      }
      nextHref={next !== null ? `/books/${book.id}/chapters/${next}` : null}
      acceptedAudioFormats={settings.acceptedAudioFormats}
      maxAudioSizeMb={settings.maxAudioSizeMb}
      acceptedScriptFormats={settings.acceptedScriptFormats}
    />
  );
}
