import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <div className="flex items-end justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>

      <div className="flex max-w-[720px] flex-col gap-6">
        {[3, 3, 4, 3, 3, 1].map((fieldCount, index) => (
          <div key={index} className="card flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64" />
            {Array.from({ length: fieldCount }).map((_, fieldIndex) => (
              <div key={fieldIndex} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-input w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
