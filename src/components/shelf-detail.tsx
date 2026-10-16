"use client";
import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json, Shelf, date } from "./api-client";
import { ShelfHeader, ShelfAction } from "./workflow-navigation";
import { DetailsDialog } from "./details-dialog";
import { Notice, Status } from "./shelf-ui";
export function ShelfDetail({ id }: { id: string }) {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const client = useQueryClient();
  const router = useRouter();
  const remove = useMutation({
    mutationFn: () => api(`/shelves/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ["shelf", id], exact: true });
      router.replace("/");
      await client.invalidateQueries();
    },
  });
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
      {query.isPending && <Notice variant="processing">Loading shelf…</Notice>}
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
          <ShelfHeader title={shelf.name} shelf={shelf}>
            <ShelfAction shelf={shelf} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  ref={menuTrigger}
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
                  Delete shelf
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  menuTrigger.current?.focus();
                }}
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{shelf.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanently remove this shelf, its photos, check history and
                    restocking tasks. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {remove.isError && (
                  <Notice error>{remove.error.message}</Notice>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={remove.isPending}>
                    Cancel
                  </AlertDialogCancel>
                  <Button
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    {remove.isPending ? "Deleting…" : "Delete shelf"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </ShelfHeader>
          <Card
            role="region"
            className="my-6 gap-4 p-4 text-base leading-6 shadow-none"
          >
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
            <DetailsDialog title="Check details">
              <p>Last valid check: {date(shelf.current?.created_at)}</p>
              <p>Restock reported: {date(shelf.reported_restocked_at)}</p>
            </DetailsDialog>
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
              with matching framing and lighting.{" "}
              <DetailsDialog title="Photo check details">
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
            </Notice>
          )}
          {(shelf.active_alert || shelf.awaiting_verification) && (
            <section
              className="my-6 flex flex-wrap items-center gap-4"
              id="restocking"
            >
              <DetailsDialog title="Restocking">
                Reporting restocked records the staff action. A subsequent valid
                photo measures stock and verifies recovery. Low or Empty results
                can still require restocking.
              </DetailsDialog>
              {shelf.awaiting_verification ? (
                <>
                  <p>Awaiting photo verification</p>
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
