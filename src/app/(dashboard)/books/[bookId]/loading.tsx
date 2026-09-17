import { Skeleton } from "@/components/ui/skeleton";

export default function BookEditorLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-32" />
        <div className="flex items-end justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="card col-span-2 flex flex-col gap-4 p-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="card col-span-1 flex flex-col gap-4 p-6">
          <Skeleton className="aspect-[2/3] w-full max-w-[200px]" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      <div className="card p-6">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
