"use client";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, Shelf } from "./api-client";
import { Notice, Status } from "./shelf-ui";
import { Button } from "./ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { cn } from "@/lib/utils";
import { shelfPresentation } from "./shelf-presentation";
export function DashboardView({ view = "" }: { view?: string }) {
  const query = useQuery({
    queryKey: ["shelves"],
    queryFn: () => api<Shelf[]>("/shelves"),
  });
  const shelves = query.data || [];
  const visible = shelves
    .filter((shelf) =>
      view === "restocking"
        ? !!shelf.active_alert
        : view === "verification"
          ? shelf.awaiting_verification
          : view === "attention"
            ? shelf.active_alert || shelf.awaiting_verification
            : true,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const destination = (task: string) => (task ? `/?view=${task}` : "/");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[1.75rem] leading-tight tracking-tight">Shelves</h1>
        <Button asChild>
          <Link href="/shelves/new">Add shelf</Link>
        </Button>
      </div>
      <div className="my-6 flex flex-wrap items-center justify-between gap-4">
        <nav
          className="task-filters flex flex-wrap gap-1 text-sm leading-6"
          aria-label="Shelf tasks"
        >
          {[
            ["", "All"],
            ["restocking", "Needs restocking"],
            ["verification", "Restock reported"],
          ].map(([value, label]) => (
            <Link
              className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-primary underline-offset-4 hover:underline aria-[current=page]:font-bold aria-[current=page]:underline"
              key={value}
              href={destination(value)}
              aria-current={view === value ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {query.isPending && (
        <Notice variant="processing">Loading shelves…</Notice>
      )}
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
              No shelves match{" "}
              {view === "verification"
                ? "Restock reported"
                : view === "restocking"
                  ? "Needs restocking"
                  : view === "attention"
                    ? "Needs attention"
                    : "All tasks"}
              . <Link href="/">Show all shelves</Link>
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
              className={cn(
                "simple-card min-w-0 gap-4 shadow-none",
                shelf.awaiting_verification
                  ? "border-primary/25 bg-secondary/40"
                  : presentation.badge === "Empty"
                    ? "border-destructive/25 bg-danger-background/30"
                    : presentation.badge === "Low"
                      ? "border-warning/25 bg-warning-background/30"
                      : "",
              )}
            >
              <CardHeader className="gap-2">
                <h2 className="text-lg font-bold leading-6 wrap-anywhere">
                  <Link
                    className="text-foreground underline-offset-4 hover:underline"
                    href={`/shelves/${shelf.id}`}
                  >
                    {shelf.name}
                  </Link>
                </h2>
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
                <Status status={presentation.badge} />
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
                <Button
                  asChild
                  variant={
                    shelf.active_alert || shelf.awaiting_verification
                      ? "default"
                      : "ghost"
                  }
                >
                  <Link href={presentation.href}>
                    {presentation.action}
                    <span aria-hidden="true">→</span>
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </>
  );
}
