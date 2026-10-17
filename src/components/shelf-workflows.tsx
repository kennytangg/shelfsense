"use client";
import { ShelfPageSkeleton } from "./shelf-skeleton";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PhotoFrame } from "./photo-frame";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json, Shelf, Analysis, uploadImage } from "./api-client";
import { Notice } from "./shelf-ui";
import { FilePicker } from "./image-upload";
import { ShelfHeader, WorkflowProgress } from "./workflow-navigation";
import { CalibrationForm } from "./shelf-calibration";
export function NewShelf() {
  const router = useRouter();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const mutation = useMutation({
    mutationFn: () => api<Shelf>("/shelves", json({ name, location })),
    onSuccess: async (shelf) => {
      await client.invalidateQueries();
      router.push(`/shelves/${shelf.id}/setup`);
    },
  });
  return (
    <>
      <ShelfHeader title="Add shelf" breadcrumbLabel="New shelf" />
      <WorkflowProgress stage="add" />
      <form
        className="mt-6 flex max-w-[44rem] flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <Label className="grid gap-2 text-base leading-6">
          Shelf name
          <Input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Label>
        <Label className="grid gap-2 text-base leading-6">
          Location
          <span
            id="location-help"
            className="text-sm leading-5 text-muted-foreground"
          >
            Where staff can find this shelf, e.g. Aisle 2, top shelf.
          </span>
          <Input
            required
            maxLength={120}
            aria-label="Location"
            aria-describedby="location-help"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Label>
        {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
        <div className="flex flex-wrap items-center gap-4 [&>button]:max-sm:w-full">
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? "Adding shelf…" : "Add shelf"}
          </Button>
        </div>
      </form>
    </>
  );
}
export function ShelfWorkflow({
  id,
  mode,
}: {
  id: string;
  mode: "setup" | "check";
}) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["shelf", id],
    queryFn: () => api<Shelf>(`/shelves/${id}`),
  });
  return (
    <>
      {!query.isPending && (
        <ShelfHeader
          title={mode === "setup" ? "Set up shelf" : "Check stock"}
          breadcrumbLabel={mode === "setup" ? "Setup" : "Stock check"}
          shelf={query.data}
        />
      )}
      {query.isPending && <ShelfPageSkeleton />}
      {query.isError && (
        <Notice error>
          {query.error.message}{" "}
          <Button variant="outline" onClick={() => query.refetch()}>
            Retry
          </Button>
        </Notice>
      )}
      {query.data && (
        <>
          <WorkflowProgress stage={mode} shelf={query.data} />
          {mode === "setup" ? (
            <CalibrationForm
              shelf={query.data}
              done={() => router.push(`/shelves/${id}/check`)}
            />
          ) : query.data.reference ? (
            <CheckForm shelf={query.data} />
          ) : (
            <Notice>
              Set up this shelf with an empty photo first.{" "}
              <Link href={`/shelves/${id}/setup`}>Set up shelf</Link>
            </Notice>
          )}
        </>
      )}
    </>
  );
}
function CheckForm({ shelf }: { shelf: Shelf }) {
  const [file, setFile] = useState<File | null>(null);
  const client = useQueryClient();
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () => uploadImage<Analysis>(shelf.id, "analyses", file!),
    onSuccess: async () => {
      await client.invalidateQueries();
      router.push(`/shelves/${shelf.id}`);
    },
    onError: () => client.invalidateQueries(),
  });
  return (
    <>
      <p className="text-base leading-6">
        Upload a current photo to update the stock estimate. Use the same camera
        position and lighting as the empty shelf photo below, with the whole
        monitored area visible.
      </p>
      <div className="check-layout mt-4 grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        <Card
          role="region"
          className="workflow-panel min-w-0 gap-4 p-4 text-base leading-6 shadow-none"
        >
          <h2 className="text-lg font-bold leading-6">Current photo</h2>
          <FilePicker
            file={file}
            setFile={(file) => {
              setFile(file);
              mutation.reset();
            }}
            disabled={mutation.isPending}
          />
          {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
          {mutation.isPending && (
            <Notice variant="processing">Checking stock…</Notice>
          )}
          <Button
            disabled={!file || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Checking stock…" : "Check stock"}
          </Button>
        </Card>
        <Card
          role="region"
          className="workflow-panel min-w-0 gap-4 p-4 text-base leading-6 shadow-none"
        >
          <h2 className="text-lg font-bold leading-6">Empty shelf photo</h2>

          <PhotoFrame>
            <img
              className="h-full w-full object-contain"
              src={shelf.reference!.url}
              alt="Empty shelf baseline; take the current photo from this position"
            />
          </PhotoFrame>
        </Card>
      </div>
    </>
  );
}
