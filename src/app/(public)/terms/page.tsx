import type { Metadata } from "next";
import { PublicDocumentView } from "@/components/public/public-document";
import { TERMS_OF_SERVICE } from "@/data/public-pages";

export const metadata: Metadata = {
  title: `${TERMS_OF_SERVICE.title} · Talebrim`,
  description: TERMS_OF_SERVICE.description,
};

export default function Page() {
  return <PublicDocumentView document={TERMS_OF_SERVICE} />;
}
