import Link from "next/link";
import { Fragment } from "react";
import type { Block, Inline, PublicDocument } from "@/data/public-pages";

// Renders one public page's content (`data/public-pages.ts`): the title, the
// date it last changed, and its sections, each with an anchor. A document for
// readers on their phones, so the body is 15px on a 24px line, wider than the
// dashboard's 14px tables.

/** Links read as text with an underline: ember on `page` is 3:1, under AA for body text. */
const LINK_CLASS = "text-text underline underline-offset-2 hover:text-primary-hover";

function Text({ content }: { content: Inline[] }) {
  return content.map((part, index) => {
    if (typeof part === "string") return <Fragment key={index}>{part}</Fragment>;
    // Within the site, a client-side link; mail and anything else, a plain one.
    return part.href.startsWith("/") ? (
      <Link key={index} href={part.href} className={LINK_CLASS}>
        {part.text}
      </Link>
    ) : (
      <a key={index} href={part.href} className={LINK_CLASS}>
        {part.text}
      </a>
    );
  });
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case "paragraph":
        return (
          <p key={index} className="mt-3 text-[15px] leading-6 text-text">
            <Text content={block.content} />
          </p>
        );
      case "list":
        return (
          <ul key={index} className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[15px] leading-6 text-text">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Text content={item} />
              </li>
            ))}
          </ul>
        );
      case "steps":
        return (
          <ol key={index} className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-6 text-text">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Text content={item} />
              </li>
            ))}
          </ol>
        );
    }
  });
}

export function PublicDocumentView({ document }: { document: PublicDocument }) {
  return (
    <article>
      <h1 className="text-page-title text-text">{document.title}</h1>
      <p className="mt-1 text-helper text-muted">Last updated {document.updated}</p>
      <Blocks blocks={document.intro} />
      {document.sections.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="mt-8 scroll-mt-6">
          <h2 id={`${section.id}-heading`} className="text-chapter-title text-text">
            {section.heading}
          </h2>
          <Blocks blocks={section.blocks} />
        </section>
      ))}
    </article>
  );
}
