import { Skeleton } from "@/components/ui/skeleton";

export default function BooksLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-16" />
        <div className="flex items-end justify-between">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      <Skeleton className="h-input w-full" />

      <div className="card p-6">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="h-[60px] w-10 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-8 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="h-3 w-20" />
    </div>
  );
}
