import { BookEditor } from "@/components/books/book-editor";
import { serverSupabaseWithSettings } from "@/lib/server-supabase";

export default async function NewBookPage() {
  // Settings are needed even in create mode: the composer's Narration card
  // renders its accepted formats and size ceiling from app_settings rather than
  // from constants (prompt 16).
  const { settings } = await serverSupabaseWithSettings();

  return (
    <BookEditor
      mode={{ kind: "create" }}
      acceptedAudioFormats={settings.acceptedAudioFormats}
      maxAudioSizeMb={settings.maxAudioSizeMb}
    />
  );
}
