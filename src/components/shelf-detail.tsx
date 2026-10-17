"use client";
import { MoreHorizontal } from "lucide-react";
import { DeleteShelf } from "./delete-shelf";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json, Shelf, date } from "./api-client";
import { ShelfHeader, ShelfAction } from "./workflow-navigation";
import { DetailsDialog } from "./details-dialog";
import { ShelfPageSkeleton } from "./shelf-skeleton";
import { Notice, Status } from "./shelf-ui";
export function ShelfDetail({ id }: { id: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["shelf", id],
    queryFn: () => api<Shelf>(`/shelves/${id}`),
  });
  const report = useMutation({
    mutationFn: () =>
      api(
        `/alerts/${query.data!.active_alert!.id}`,
        json({ action: "report_restocked" }, "PATCH"),
      ),
    onSettled: () => client.invalidateQueries(),
  });
  const shelf = query.data;
  return (
    <>
      {query.isPending && <ShelfPageSkeleton />}
      {query.isError && (
        <Notice error>
          {query.error.message}{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </Notice>
      )}
      {shelf && (
        <>
          <ShelfHeader
            title={shelf.name}
            shelf={shelf}
            guidance={
              <DetailsDialog title="Shelf guide and details">
                <p>Last valid check: {date(shelf.current?.created_at)}</p>
                <p>Restock reported: {date(shelf.reported_restocked_at)}</p>
                <p>
                  Report restocked after refilling the shelf. The stock estimate
                  updates when you check another photo.
                </p>
                {[
                  ...new Set(
                    [
                      shelf.last_error,
                      ...(shelf.latest_attempt?.warnings || []),
                    ].filter(Boolean),
                  ),
                ].map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
              </DetailsDialog>
            }
          >
            <ShelfAction shelf={shelf} />
            <DeleteShelf shelf={shelf} redirect />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Shelf actions">
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/shelves/${id}/setup`}>Change setup</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ShelfHeader>
          <Card
            role="region"
            className="my-6 gap-4 p-4 text-base leading-6 shadow-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold leading-6">
                {shelf.last_error ||
                (shelf.latest_attempt &&
                  shelf.latest_attempt.outcome !== "Valid" &&
                  shelf.latest_attempt.id !== shelf.current?.id)
                  ? shelf.current
                    ? "Previous valid result"
                    : "No valid result"
                  : "Latest result"}
              </h2>
              <Status
                status={
                  shelf.current
                    ? shelf.current.classification || shelf.status
                    : shelf.reference
                      ? "Needs first check"
                      : "Needs setup"
                }
              />
            </div>
            {shelf.current && (
              <img
                className="mx-auto block max-h-96 max-w-full rounded-lg object-contain"
                src={shelf.current.input.url}
                alt="Shelf photo from the latest valid check"
              />
            )}
            {!shelf.current && (
              <p>
                {shelf.reference
                  ? "Submit a current photo to see the shelf status."
                  : "Set up this shelf with an empty photo to begin."}
              </p>
            )}
          </Card>
          {(shelf.last_error ||
            (shelf.latest_attempt &&
              shelf.latest_attempt.outcome !== "Valid" &&
              shelf.latest_attempt.id !== shelf.current?.id)) && (
            <Notice error>
              Photo check needs attention. Retake from the reference position
              with matching framing and lighting.
            </Notice>
          )}
          {(shelf.active_alert || shelf.awaiting_verification) && (
            <section
              className="my-6 flex flex-wrap items-center gap-4"
              id="restocking"
            >
              {shelf.awaiting_verification ? (
                <>
                  <p>
                    Restock reported. Check stock with a new photo to update the
                    result.
                  </p>
                </>
              ) : (
                <>
                  <p>This shelf needs restocking.</p>
                  <Button
                    disabled={report.isPending}
                    onClick={() => report.mutate()}
                  >
                    {report.isPending ? "Saving…" : "Report restocked"}
                  </Button>
                </>
              )}
              {report.isError && <Notice error>{report.error.message}</Notice>}
            </section>
          )}
        </>
      )}
    </>
  );
}
