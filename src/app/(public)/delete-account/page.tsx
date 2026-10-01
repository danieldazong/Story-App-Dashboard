import type { Metadata } from "next";
import { PublicDocumentView } from "@/components/public/public-document";
import { DELETE_ACCOUNT } from "@/data/public-pages";

export const metadata: Metadata = {
  title: `${DELETE_ACCOUNT.title} · Talebrim`,
  description: DELETE_ACCOUNT.description,
};

export default function Page() {
  return <PublicDocumentView document={DELETE_ACCOUNT} />;
}
