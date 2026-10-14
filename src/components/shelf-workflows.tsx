"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json, Shelf, Analysis, uploadImage } from "./api-client";
import { Notice } from "./ui";
import { FilePicker } from "./image-upload";
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
      <Link href="/">Back to shelves</Link>
      <h1>Add shelf</h1>
      <form
        className="simple-form"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <label>
          Shelf name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Location
          <span className="field-help">
            Where staff can find this shelf, e.g. Aisle 2, top shelf.
          </span>
          <input
            required
            maxLength={120}
            aria-label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
        <div className="form-actions">
          <Link href="/">Cancel</Link>
          <button className="button" disabled={mutation.isPending}>
            {mutation.isPending ? "Adding shelf…" : "Add shelf"}
          </button>
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
      <div className="workflow-navigation">
        <Link href="/">← Back to shelves</Link>
        <Link className="button secondary" href="/">
          Cancel
        </Link>
      </div>
      <h1>{mode === "setup" ? "Set up shelf" : "Check shelf"}</h1>
      {query.isPending && <Notice>Loading shelf…</Notice>}
      {query.isError && (
        <Notice error>
          {query.error.message}{" "}
          <button onClick={() => query.refetch()}>Retry</button>
        </Notice>
      )}
      {query.data && (
        <>
          <p className="workflow-context">
            {query.data.name} · {query.data.location}
          </p>
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
    <div className="check-layout">
      <section className="workflow-panel">
        <h2>Current shelf photo</h2>
        <p>
          Choose a current photo taken from the same position and lighting as
          the empty reference shown here.
        </p>
        {shelf.awaiting_verification && (
          <Notice>
            A new valid photo verifies restocking. The previous measured status
            stays visible until then.
          </Notice>
        )}
        <FilePicker
          file={file}
          setFile={(file) => {
            setFile(file);
            mutation.reset();
          }}
          disabled={mutation.isPending}
        />
        {mutation.isError && <Notice error>{mutation.error.message}</Notice>}
        <button
          className="button"
          disabled={!file || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Analyzing photo…" : "Analyze photo"}
        </button>
      </section>
      <aside className="workflow-panel reference-panel">
        <h2>Empty reference</h2>
        <p>Match this framing and lighting when taking your current photo.</p>
        <img
          className="upload-preview"
          src={shelf.reference!.url}
          alt="Empty reference for matching the photo framing"
        />
      </aside>
    </div>
  );
}
