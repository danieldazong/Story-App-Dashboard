import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the import screen's real shell so nothing shifts when data lands:
 * breadcrumb, back link, title row with its action slot, then the Manuscript
 * files card with its dashed dropzone at full height.
 *
 * The Matching preview card is deliberately absent. It only renders once files
 * have been dropped, and a skeleton for a card that will not be there on first
 * paint would itself be the layout shift this file exists to prevent.
 */
export default function ImportLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-24" />
        <div className="flex items-end justify-between">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>

      <div className="card flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-80" />
        </div>
        <Skeleton className="h-[160px] w-full rounded-input" />
      </div>
    </div>
  );
}
