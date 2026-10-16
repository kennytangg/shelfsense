"use client";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, Shelf } from "./api-client";
import { Notice, Status } from "./shelf-ui";
import { Button } from "./ui/button";
import { Card, CardHeader, CardContent, CardFooter } from "./ui/card";
import { Label } from "./ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { shelfPresentation } from "./shelf-presentation";
export function DashboardView({
  status = "",
  view = "",
}: {
  status?: string;
  view?: string;
}) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["shelves"],
    queryFn: () => api<Shelf[]>("/shelves"),
  });
  const shelves = query.data || [];
  const visible = shelves
    .filter(
      (shelf) =>
        (!status || shelf.status === status) &&
        (view === "restocking"
          ? !!shelf.active_alert
          : view === "verification"
            ? shelf.awaiting_verification
            : view === "attention"
              ? shelf.active_alert || shelf.awaiting_verification
              : true),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const destination = (task: string, stock = status) => {
    const params = new URLSearchParams();
    if (task) params.set("view", task);
    if (stock) params.set("status", stock);
    return `/?${params}`;
  };
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
            ["verification", "Awaiting verification"],
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
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="shelf-status">Measured stock</Label>
          <Select
            value={status || "all"}
            onValueChange={(value) =>
              router.push(destination(view, value === "all" ? "" : value))
            }
          >
            <SelectTrigger
              id="shelf-status"
              className="w-44 bg-card text-sm leading-6"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All stock levels</SelectItem>
              {["Full", "Low", "Empty"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {status && !query.isPending && (
        <p className="text-sm leading-5 text-muted-foreground">
          {visible.length} shelves · {status} stock ·{" "}
          <Link href={destination(view, "")}>Clear stock filter</Link>
        </p>
      )}
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
                ? "Awaiting verification"
                : view === "restocking"
                  ? "Needs restocking"
                  : view === "attention"
                    ? "Needs attention"
                    : "All tasks"}
              {status ? ` · ${status} stock` : ""}.{" "}
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
                <h2 className="text-lg font-bold leading-6 wrap-anywhere">
                  <Link
                    className="text-primary hover:underline"
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
              {presentation.exception && (
                <CardContent>
                  <p className="text-sm leading-5 text-warning">
                    {presentation.exception}
                  </p>
                </CardContent>
              )}
              <CardFooter className="mt-auto justify-end border-0 bg-transparent pt-0">
                <Button asChild variant="outline">
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
