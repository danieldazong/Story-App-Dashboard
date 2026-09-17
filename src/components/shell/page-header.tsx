import { Breadcrumbs, type BreadcrumbItem } from "@/components/shell/breadcrumbs";

export function PageHeader({
  breadcrumbs,
  title,
  subLine,
  action,
}: {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  subLine?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Breadcrumbs items={breadcrumbs} />
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
