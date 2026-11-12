"use client";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useShelves } from "./use-shelves";
import {
  SHELF_STATUSES,
  ShelfView,
  filterShelves,
  sortByUrgency,
  summarizeShelves,
} from "./shelf-summary";
import { Notice, Status } from "./shelf-ui";
import { Button } from "./ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { ShelvesSkeleton } from "./shelf-skeleton";
import { shelfPresentation } from "./shelf-presentation";
export function DashboardView({
  view = "",
  status = "",
}: {
  view?: ShelfView;
  status?: string;
}) {
  const router = useRouter();
  const query = useShelves();
  const [search, setSearch] = useState("");
  const shelves = query.data || [];
  const summary = summarizeShelves(shelves);
  const visible = sortByUrgency(
    filterShelves(shelves, { view, status, search }),
  );
  const destination = (next: { view?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (next.view) params.set("view", next.view);
    if (next.status) params.set("status", next.status);
    const text = params.toString();
    return text ? `/?${text}` : "/";
  };
  const tabs: [ShelfView, string, number][] = [
    ["", "All", summary.total],
    ["attention", "Needs attention", summary.attention],
    ["restocking", "Needs restocking", summary.restocking],
    ["verification", "Restock reported", summary.verification],
  ];
  const stats: [string, number][] = [
    ["Empty", summary.empty],
    ["Low", summary.low],
    ["Full", summary.full],
    ["Not checked", summary.notChecked],
    ["Needs setup", summary.needsSetup],
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[1.75rem] leading-tight tracking-tight">Shelves</h1>
        <Button asChild>
          <Link href="/shelves/new">Add shelf</Link>
        </Button>
      </div>
      {!query.isPending && !query.isError && summary.total > 0 && (
        <ul
          className="my-6 grid grid-cols-2 gap-3 sm:grid-cols-5"
          aria-label="Stock summary"
        >
          {stats.map(([label, count]) => (
            <li key={label}>
              <Link
                className="block rounded-lg border p-3 text-sm leading-5 aria-[current=true]:border-primary aria-[current=true]:font-bold"
                href={destination({ status: status === label ? "" : label })}
                aria-current={status === label}
              >
                <span className="block text-2xl tabular-nums">{count}</span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="my-6 flex flex-wrap items-center justify-between gap-4">
        <nav
          className="task-filters grid w-full grid-cols-2 gap-1 text-sm leading-5 sm:flex sm:w-auto sm:flex-wrap sm:leading-6"
          aria-label="Shelf tasks"
        >
          {tabs.map(([value, label, count]) => (
            <Link
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 py-2 text-center text-primary underline-offset-4 hover:underline aria-[current=page]:bg-secondary aria-[current=page]:font-bold aria-[current=page]:underline sm:px-3"
              key={value}
              href={destination({ view: value, status })}
              aria-current={view === value ? "page" : undefined}
            >
              {label}
              <span className="tabular-nums">({count})</span>
            </Link>
          ))}
        </nav>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <input
            type="search"
            aria-label="Search shelves"
            placeholder="Search name or location"
            className="min-h-11 flex-1 rounded-lg border bg-background px-3 text-sm sm:w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Filter by stock status"
            className="min-h-11 rounded-lg border bg-background px-2 text-sm"
            value={status}
            onChange={(e) =>
              router.push(destination({ view, status: e.target.value }))
            }
          >
            <option value="">All statuses</option>
            {SHELF_STATUSES.map((label) => (
              <option key={label}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      {query.isPending && <ShelvesSkeleton />}
      {query.isError && (
        <Notice error>
          {query.error.message}{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </Notice>
      )}
      {!query.isPending && !query.isError && !visible.length && (
        <Notice>
          {shelves.length ? (
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
          return (
            <Card
              key={shelf.id}
              role="article"
              aria-label={shelf.name}
              className="simple-card min-w-0 gap-4 shadow-none"
            >
              <CardHeader className="gap-2">
                <div className="flex flex-col items-start justify-between gap-3 min-[400px]:flex-row">
                  <h2 className="min-w-0 text-lg font-bold leading-6 wrap-anywhere">
                    {shelf.name}
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
              <CardContent className="space-y-2 text-muted-foreground">
                <p className="text-sm leading-5">
                  {shelf.awaiting_verification
                    ? "Restock reported · Confirm the refill with a new photo."
                    : presentation.badge === "Empty"
                      ? "Shelf is empty. Refill it as soon as possible."
                      : presentation.badge === "Low"
                        ? "Stock is running low. Top up this shelf."
                        : presentation.badge === "Full"
                          ? "Stock looks sufficient. No restocking needed."
                          : "Set up this shelf and upload a photo to check stock."}
                </p>
                {presentation.exception && (
                  <p className="text-sm leading-5 text-warning">
                    {presentation.exception}
                  </p>
                )}
              </CardContent>
              <CardFooter className="mt-auto flex-wrap justify-end gap-2 border-0 bg-transparent pt-0">
                <Button asChild variant="ghost">
                  <Link href={`/shelves/${shelf.id}`}>View shelf</Link>
                </Button>
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
