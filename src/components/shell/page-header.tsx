import Link from "next/link";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/shell/breadcrumbs";

export function PageHeader({
  breadcrumbs,
  title,
  subLine,
  action,
  backLink,
}: {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  subLine?: string;
  action?: React.ReactNode;
  /**
   * An explicit way back, for screens deep enough that the breadcrumb alone
   * isn't enough.
   *
   * The breadcrumb is already a working link, but muted inline text does not
   * read as a control — operators reach for the browser's back button instead.
   * Naming the destination ("← Back to <book>") makes the affordance obvious.
   * Optional, so top-level screens stay as they are.
   */
  backLink?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumbs items={breadcrumbs} />
      {backLink && (
        <Link
          href={backLink.href}
          className="w-fit text-helper text-muted hover:text-text"
        >
          ← Back to {backLink.label}
        </Link>
      )}
      <div className="card__header">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title">{title}</h1>
          {subLine && <p className="card__sub-line">{subLine}</p>}
        </div>
        {action && <div className="card__header-actions">{action}</div>}
      </div>
    </div>
  );
}
