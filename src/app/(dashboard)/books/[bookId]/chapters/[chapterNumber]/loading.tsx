import { Skeleton } from "@/components/ui/skeleton";

export default function ChapterEditorLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-40" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="card col-span-2 flex flex-col gap-4 p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-4 w-20" />
        </div>

        <div className="col-span-1 flex flex-col gap-6">
          <div className="card flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="card flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
