import { BookEditor } from "@/components/books/book-editor";

export default function NewBookPage() {
  return <BookEditor mode={{ kind: "create" }} />;
}
