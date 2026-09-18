import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      {/*
        Each tile now carries a sub-line under its number, and the third also
        has a 4px coverage bar. The skeleton mirrors that: a tile that skips the
        sub-line is ~18px shorter than the real one, and the whole page below it
        jumps on arrival. Zero layout shift is the point of this file.
      */}
      <div className="grid grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="card flex flex-col gap-2 p-6">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            {index === 2 && <Skeleton className="h-1 w-full" />}
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/*
        Both cards scroll internally at a fixed height now, so the skeleton
        shows exactly the number of rows that fits rather than a guess. Five
        48px queue rows and six activity rows match the real cards' windows —
        a skeleton taller than its card is the layout shift this file exists
        to prevent.
      */}
      <div className="card p-6">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>

      <div className="card p-6">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
