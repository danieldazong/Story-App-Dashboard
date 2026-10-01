import type { Metadata } from "next";
import { PublicDocumentView } from "@/components/public/public-document";
import { PRIVACY_POLICY } from "@/data/public-pages";

export const metadata: Metadata = {
  title: `${PRIVACY_POLICY.title} · Talebrim`,
  description: PRIVACY_POLICY.description,
};

export default function Page() {
  return <PublicDocumentView document={PRIVACY_POLICY} />;
}
