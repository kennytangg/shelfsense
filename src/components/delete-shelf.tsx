"use client";
import { useEffect, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Shelf } from "./api-client";
import { Button } from "./ui/button";
import { Notice } from "./shelf-ui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
/** Confirmation dialog only; the caller owns the control that opens it. */
export function DeleteShelf({
  shelf,
  open,
  onOpenChange,
  returnFocus,
  redirect = false,
}: {
  shelf: Shelf;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus?: RefObject<HTMLElement | null>;
  redirect?: boolean;
}) {
  const client = useQueryClient();
  const router = useRouter();
  const remove = useMutation({
    mutationFn: () => api(`/shelves/${shelf.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ["shelf", shelf.id], exact: true });
      onOpenChange(false);
      if (redirect) router.replace("/");
      await client.invalidateQueries();
    },
  });
  const resetRemove = remove.reset;
  useEffect(() => {
    if (open) resetRemove();
  }, [open, resetRemove]);
  return (
    <>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus?.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{shelf.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove this shelf, its photos, check history and
              restocking tasks. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError && <Notice error>{remove.error.message}</Notice>}
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
    </>
  );
}
