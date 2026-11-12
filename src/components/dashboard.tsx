"use client";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useShelves } from "./use-shelves";
import {
  ShelfView,
  filterShelves,
  sortByUrgency,
  summarizeShelves,
} from "./shelf-summary";
import { LoadError, Notice, Status } from "./shelf-ui";
import { Button } from "./ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { ShelvesSkeleton } from "./shelf-skeleton";
import { shelfPresentation } from "./shelf-presentation";

/** Search only earns its space once the list is long enough to scan slowly. */
export const SEARCH_MIN_SHELVES = 8;

export function DashboardView({
  view = "",
  status = "",
}: {
  view?: ShelfView;
  status?: string;
}) {
  const query = useShelves();
  const [search, setSearch] = useState("");
  const shelves = query.data || [];
  const summary = summarizeShelves(shelves);
  const visible = sortByUrgency(
    filterShelves(shelves, { view, status, search }),
  );
  const loaded = !query.isPending && !query.isError;
  const hasShelves = summary.total > 0;
  const destination = (next: { view?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (next.view) params.set("view", next.view);
    if (next.status) params.set("status", next.status);
    const text = params.toString();
    return text ? `/?${text}` : "/";
  };
  const stats: [string, number][] = [
    ["Empty", summary.empty],
    ["Low", summary.low],
    ["Full", summary.full],
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[1.75rem] leading-tight tracking-tight">Shelves</h1>
        {!(loaded && !hasShelves) && (
          <Button asChild>
            <Link href="/shelves/new">Add shelf</Link>
          </Button>
        )}
      </div>
      {view === "attention" && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 text-sm leading-5 text-muted-foreground">
          Showing shelves that need attention.
          <Link
            className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
            href={destination({ status })}
          >
            Back to all shelves
          </Link>
        </p>
      )}
      {loaded && hasShelves && (
        <ul className="my-6 grid grid-cols-3 gap-3" aria-label="Stock summary">
          {stats.map(([label, count]) => (
            <li key={label}>
              <Link
                className="block rounded-lg border p-3 text-sm leading-5 aria-[current=true]:border-primary aria-[current=true]:font-bold"
                href={destination({
                  view,
                  status: status === label ? "" : label,
                })}
                aria-current={status === label}
              >
                <span className="block text-2xl tabular-nums">{count}</span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {loaded && summary.total >= SEARCH_MIN_SHELVES && (
        <input
          type="search"
          aria-label="Search shelves"
          placeholder="Search name or location"
          className="mb-6 min-h-11 w-full rounded-lg border bg-background px-3 text-sm sm:w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {query.isPending && <ShelvesSkeleton />}
      {query.isError && (
        <LoadError
          what="shelves"
          error={query.error}
          onRetry={() => query.refetch()}
        />
      )}
      {loaded && !visible.length && (
        <Notice>
          {hasShelves ? (
            <>
              No shelves match the current filters.{" "}
              <Link href="/">Show all shelves</Link>
            </>
          ) : (
            <>
              <p>
                Add your first shelf, then set it up with an empty reference
                photo.
              </p>
              <Link href="/shelves/new">Add shelf</Link>
            </>
          )}
        </Notice>
      )}
      <div className="shelf-list mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
        {visible.map((shelf) => {
          const presentation = shelfPresentation(shelf);
          const hasNotes =
            shelf.awaiting_verification || !!presentation.exception;
          return (
            <Card
              key={shelf.id}
              role="article"
              aria-label={shelf.name}
              className="simple-card relative min-w-0 gap-4 shadow-none"
            >
              <CardHeader className="gap-2">
                <div className="flex flex-col items-start justify-between gap-3 min-[400px]:flex-row">
                  <h2 className="min-w-0 text-lg font-bold leading-6 wrap-anywhere">
                    <Link
                      className="underline-offset-4 after:absolute after:inset-0 after:rounded-lg hover:underline"
                      href={`/shelves/${shelf.id}`}
                    >
                      {shelf.name}
                    </Link>
                  </h2>
                  <Status status={presentation.badge} />
                </div>
                <p className="flex items-start gap-1 text-sm leading-5 text-muted-foreground wrap-anywhere">
                  <MapPin
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {shelf.location}
                    {shelf.demo ? " · Sample shelf" : ""}
                  </span>
                </p>
              </CardHeader>
              {hasNotes && (
                <CardContent className="space-y-2">
                  {shelf.awaiting_verification && (
                    <p className="text-sm leading-5 text-muted-foreground">
                      Restock reported · Confirm the refill with a new photo.
                    </p>
                  )}
                  {presentation.exception && (
                    <p className="text-sm leading-5 text-warning">
                      {presentation.exception}
                    </p>
                  )}
                </CardContent>
              )}
              <CardFooter className="relative z-10 mt-auto flex-wrap justify-end gap-2 border-0 bg-transparent pt-0">
                <Button asChild>
                  <Link href={presentation.href}>{presentation.action}</Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </>
  );
}
