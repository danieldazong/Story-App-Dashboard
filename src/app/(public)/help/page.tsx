import type { Metadata } from "next";
import { PublicDocumentView } from "@/components/public/public-document";
import { HELP } from "@/data/public-pages";

export const metadata: Metadata = {
  title: `${HELP.title} · Talebrim`,
  description: HELP.description,
};

export default function Page() {
  return <PublicDocumentView document={HELP} />;
}
