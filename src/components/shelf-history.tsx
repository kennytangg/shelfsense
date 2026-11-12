"use client";
import { useQuery } from "@tanstack/react-query";
import { Analysis, api, date, percent } from "./api-client";
import { Card } from "./ui/card";
import { Status } from "./shelf-ui";

/** Newest-first record of checks, so staff can see how a shelf changed. */
export function ShelfHistory({ shelfId }: { shelfId: string }) {
  const query = useQuery({
    queryKey: ["shelf", shelfId, "analyses"],
    queryFn: () => api<Analysis[]>(`/shelves/${shelfId}/analyses?limit=20`),
  });
  if (query.isPending || query.isError || !query.data.length) return null;
  return (
    <Card
      role="region"
      aria-label="Check history"
      className="my-6 gap-4 p-4 text-base leading-6 shadow-none"
    >
      <h2 className="text-lg font-bold leading-6">Check history</h2>
      <ol className="divide-y text-sm leading-5">
        {query.data.map((analysis) => (
          <li
            key={analysis.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <span>{date(analysis.created_at)}</span>
            {analysis.classification ? (
              <Status status={analysis.classification} />
            ) : (
              <span className="text-muted-foreground">{analysis.outcome}</span>
            )}
            <span className="tabular-nums text-muted-foreground">
              Coverage {percent(analysis.occupancy_ratio)}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
