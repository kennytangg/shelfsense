"use client";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
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
export function DeleteShelf({
  shelf,
  redirect = false,
}: {
  shelf: Shelf;
  redirect?: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const client = useQueryClient();
  const router = useRouter();
  const remove = useMutation({
    mutationFn: () => api(`/shelves/${shelf.id}`, { method: "DELETE" }),
    onSuccess: async () => {
      client.removeQueries({ queryKey: ["shelf", shelf.id], exact: true });
      setConfirmDelete(false);
      if (redirect) router.replace("/");
      await client.invalidateQueries();
    },
  });
  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        className="text-destructive"
        onClick={() => {
          remove.reset();
          setConfirmDelete(true);
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" /> Delete shelf
      </Button>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
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
