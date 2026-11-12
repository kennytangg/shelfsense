"use client";
import { Camera, MoreHorizontal, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
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
import { ShelfPageSkeleton } from "./shelf-skeleton";
import { LoadError, Notice, Status } from "./shelf-ui";
import { shelfPresentation } from "./shelf-presentation";
import { ShelfHistory } from "./shelf-history";

const GENERIC_PHOTO_FAILURE =
  "The latest photo could not be checked. Retake it from the reference position with matching framing and lighting.";

/** The specific reasons the latest photo was not accepted, without repeats. */
const failureReasons = (shelf: Shelf) => [
  ...new Set(
    [shelf.last_error, ...(shelf.latest_attempt?.warnings || [])].filter(
      (reason): reason is string => !!reason,
    ),
  ),
];

export function ShelfDetail({
  id,
  duplicate = false,
}: {
  id: string;
  duplicate?: boolean;
}) {
  const client = useQueryClient();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  // A shelf that needs restocking keeps "Report restocked" below; "Check stock" stays in the header.
  const needsRestockReport =
    !!shelf?.active_alert && !shelf.awaiting_verification;
  const failed = shelf ? !!shelfPresentation(shelf).exception : false;
  return (
    <>
      {query.isPending && <ShelfPageSkeleton />}
      {query.isError && (
        <LoadError
          what="this shelf"
          error={query.error}
          onRetry={() => query.refetch()}
        />
      )}
      {shelf && (
        <>
          <ShelfHeader title={shelf.name} shelf={shelf}>
            {needsRestockReport ? (
              <Button asChild>
                <Link href={`/shelves/${id}/check`}>
                  <Camera className="size-4 shrink-0" aria-hidden="true" />
                  Check stock
                </Link>
              </Button>
            ) : (
              <ShelfAction shelf={shelf} />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={menuTrigger}
                  variant="ghost"
                  size="icon"
                  aria-label="Shelf actions"
                >
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/shelves/${id}/setup`}>Change setup</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 aria-hidden="true" /> Delete shelf
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ShelfHeader>
          <DeleteShelf
            shelf={shelf}
            redirect
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            returnFocus={menuTrigger}
          />
          {duplicate && (
            <Notice variant="success">
              This photo was already checked. Showing the earlier result.
            </Notice>
          )}
          {failed && (
            <Notice error>
              {failureReasons(shelf).join(" ") || GENERIC_PHOTO_FAILURE}
            </Notice>
          )}
          {(shelf.active_alert || shelf.awaiting_verification) && (
            <section
              className="my-6 flex flex-wrap items-center gap-4"
              id="restocking"
            >
              {shelf.awaiting_verification ? (
                <p>
                  Restock reported. Check stock with a new photo to update the
                  result.
                </p>
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
          <Card
            role="region"
            className="my-6 gap-4 p-4 text-base leading-6 shadow-none"
          >
            <div className="flex flex-col items-start justify-between gap-3 min-[400px]:flex-row">
              <div>
                <h2 className="text-lg font-bold leading-6">
                  {failed
                    ? shelf.current
                      ? "Previous valid result"
                      : "No valid result"
                    : "Latest result"}
                </h2>
                {shelf.current && (
                  <p className="text-sm leading-5 text-muted-foreground">
                    Last checked {date(shelf.current.created_at)}
                  </p>
                )}
              </div>
              <Status
                status={
                  shelf.current
                    ? shelf.current.classification || shelf.status
                    : shelf.reference
                      ? "Not checked yet"
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
          <ShelfHistory shelfId={id} />
        </>
      )}
    </>
  );
}
