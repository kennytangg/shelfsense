import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

export function ShelvesSkeleton() {
  return (
    <div role="status" aria-label="Loading shelves" aria-busy="true">
      <span className="sr-only">Loading shelves…</span>
      <div
        aria-hidden="true"
        className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="min-w-0 gap-4 shadow-none">
            <CardHeader className="gap-2">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-6 w-16" />
              </div>
              <Skeleton className="h-5 w-1/2" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </CardContent>
            <CardFooter className="justify-end border-0 bg-transparent pt-0">
              <Skeleton className="h-10 w-24" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ShelfPageSkeleton() {
  return (
    <div role="status" aria-label="Loading shelf" aria-busy="true">
      <span className="sr-only">Loading shelf…</span>
      <div aria-hidden="true" className="space-y-6">
        <Skeleton className="my-4 h-10 w-48" />
        <Skeleton className="h-8 w-2/3 max-w-sm" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-32" />
        <Card className="gap-4 p-4 shadow-none">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="aspect-4/3 max-h-96 w-full" />
        </Card>
      </div>
    </div>
  );
}
