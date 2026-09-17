"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { GenreMultiSelect } from "@/components/books/genre-multi-select";
import { GENRES } from "@/data/genres";
import { MATURITY_LEVELS } from "@/data/maturity-levels";
import type { Book } from "@/types/catalog";

export const BOOK_DETAILS_FORM_ID = "book-details-form";

const bookDetailsSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().min(1, "Author is required"),
  shortDescription: z.string().max(160, "Keep it under 160 characters"),
  synopsis: z.string().max(600, "Keep it under 600 characters"),
  genres: z.array(z.string()),
  maturity: z.enum(["general", "mature_17"]),
  defaultChapterAccess: z.enum(["free", "locked"]),
  status: z.enum(["draft", "published"]),
});

export type BookDetailsValues = z.infer<typeof bookDetailsSchema>;

function defaultValuesFor(book: Book | null): BookDetailsValues {
  if (!book) {
    return {
      title: "",
      author: "",
      shortDescription: "",
      synopsis: "",
      genres: [],
      maturity: "mature_17",
      defaultChapterAccess: "locked",
      status: "draft",
    };
  }
  return {
    title: book.title,
    author: book.author,
    shortDescription: book.shortDescription,
    synopsis: book.synopsis,
    genres: book.genres,
    maturity: book.maturity,
    defaultChapterAccess: book.defaultChapterAccess,
    status: book.status,
  };
}

export function useBookDetailsForm(book: Book | null) {
  return useForm<BookDetailsValues>({
    resolver: zodResolver(bookDetailsSchema),
    defaultValues: defaultValuesFor(book),
    mode: "onChange",
  });
}

export function BookEditorSaveButton({
  isCreate,
  onCreateClick,
}: {
  isCreate: boolean;
  onCreateClick?: () => void;
}) {
  const { formState } = useFormContext<BookDetailsValues>();
  const disabled = isCreate ? !formState.isValid : !formState.isDirty || !formState.isValid;

  if (isCreate) {
    return (
      <Button type="button" disabled={disabled} onClick={onCreateClick}>
        Create Story
      </Button>
    );
  }

  return (
    <Button type="submit" form={BOOK_DETAILS_FORM_ID} disabled={disabled}>
      Save
    </Button>
  );
}

export function BookDetailsForm({ isCreate }: { isCreate: boolean }) {
  const form = useFormContext<BookDetailsValues>();
  const shortDescription = useWatch({
    control: form.control,
    name: "shortDescription",
  });
  const synopsis = useWatch({ control: form.control, name: "synopsis" });

  function onSubmit() {
    // Create mode submits via the Create Story dialog instead (see
    // book-editor.tsx) so an operator picks Draft or Publish there.
    if (isCreate) return;
    toast.success("Book saved");
  }

  return (
    <div className="card flex flex-col gap-6 p-6">
      <h2 className="card__header-title">Book details</h2>

      <form
        id={BOOK_DETAILS_FORM_ID}
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="field-group">
              <FormLabel className="field-group__label">Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <p className="field-group__helper">
                The public title shown across reader clients.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="author"
          render={({ field }) => (
            <FormItem className="field-group">
              <FormLabel className="field-group__label">Author</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <p className="field-group__helper">Author pen name.</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="shortDescription"
          render={({ field }) => (
            <FormItem className="field-group">
              <div className="flex items-center justify-between">
                <FormLabel className="field-group__label">
                  Short description
                </FormLabel>
                <span className="font-mono text-mono text-muted">
                  {shortDescription.length} / 160
                </span>
              </div>
              <FormControl>
                <Textarea {...field} rows={2} maxLength={160} />
              </FormControl>
              <p className="field-group__helper">
                Shown on cards and in search
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="synopsis"
          render={({ field }) => (
            <FormItem className="field-group">
              <div className="flex items-center justify-between">
                <FormLabel className="field-group__label">Synopsis</FormLabel>
                <span className="font-mono text-mono text-muted">
                  {synopsis.length} / 600
                </span>
              </div>
              <FormControl>
                <Textarea {...field} rows={5} maxLength={600} />
              </FormControl>
              <p className="field-group__helper">
                Shown on the story detail page
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="genres"
          render={({ field }) => (
            <FormItem className="field-group">
              <FormLabel className="field-group__label">Genres</FormLabel>
              <FormControl>
                <GenreMultiSelect
                  value={field.value}
                  onChange={field.onChange}
                  genres={GENRES}
                />
              </FormControl>
              <p className="field-group__helper">
                Select relevant genres and tropes
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="maturity"
          render={({ field }) => (
            <FormItem className="field-group">
              <FormLabel className="field-group__label">Maturity</FormLabel>
              <FormControl>
                <SegmentedControl
                  value={field.value}
                  onChange={field.onChange}
                  options={MATURITY_LEVELS.map((level) => ({
                    value: level.value,
                    label: level.label,
                  }))}
                  aria-label="Maturity"
                />
              </FormControl>
              <p className="field-group__helper">
                Age verification requirement
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="defaultChapterAccess"
          render={({ field }) => (
            <FormItem className="field-group">
              <FormLabel className="field-group__label">
                Default chapter access
              </FormLabel>
              <FormControl>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="locked">Locked</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <p className="field-group__helper">
                Applied to new chapters in this book. Individual chapters can
                override it.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {!isCreate && (
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem className="field-group">
                <FormLabel className="field-group__label">Status</FormLabel>
                <FormControl>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <p className="field-group__helper">Publication visibility</p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </form>
    </div>
  );
}
