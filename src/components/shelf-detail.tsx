"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, json, Shelf, date } from "./api-client";
import { Notice, Status } from "./ui";
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
      <Link href="/">Back to shelves</Link>
      {query.isPending && <Notice>Loading shelf…</Notice>}
      {query.isError && (
        <Notice error>
          {query.error.message}{" "}
          <button onClick={() => query.refetch()}>Retry</button>
        </Notice>
      )}
      {shelf && (
        <>
          <h1>{shelf.name}</h1>
          <p>
            {shelf.location}
            {shelf.demo ? " · Sample shelf" : ""}
          </p>
          <div className="form-actions">
            <Link
              className="button"
              href={`/shelves/${id}/${shelf.reference ? "check" : "setup"}`}
            >
              {shelf.reference ? "Check shelf" : "Set up shelf"}
            </Link>
            {shelf.reference && (
              <Link href={`/shelves/${id}/setup`}>Change setup</Link>
            )}
          </div>
          <section className="simple-card result-card">
            <h2>Latest result</h2>
            <Status
              status={
                shelf.current
                  ? shelf.current.classification || shelf.status
                  : shelf.reference
                    ? "Needs first check"
                    : "Needs setup"
              }
            />
            <p>Checked: {date(shelf.current?.created_at)}</p>
            {shelf.current && (
              <img
                className="upload-preview"
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
          </section>
          {shelf.last_error && (
            <Notice error>
              Latest check failed: {shelf.last_error}. Try a photo with matching
              framing and lighting.{" "}
              {shelf.current
                ? "The previous valid result remains visible."
                : "This shelf has no valid result for its current setup yet."}
            </Notice>
          )}
          {shelf.latest_attempt &&
            shelf.latest_attempt.outcome !== "Valid" &&
            shelf.latest_attempt.id !== shelf.current?.id &&
            shelf.latest_attempt.warnings.length > 0 && (
              <Notice>{shelf.latest_attempt.warnings.join(" ")}</Notice>
            )}
          {(shelf.active_alert || shelf.awaiting_verification) && (
            <section className="simple-card">
              <h2>Restocking</h2>
              {shelf.awaiting_verification ? (
                <>
                  <p>
                    Waiting for a new photo. Staff reported restocked{" "}
                    {date(shelf.reported_restocked_at)}.
                  </p>
                  <p>
                    The previous measured status remains until a valid check
                    verifies recovery.
                  </p>
                  <Link href={`/shelves/${id}/check`}>Check shelf</Link>
                </>
              ) : (
                <>
                  <p>This shelf needs restocking.</p>
                  <button
                    className="button"
                    disabled={report.isPending}
                    onClick={() => report.mutate()}
                  >
                    {report.isPending ? "Saving…" : "I've restocked this shelf"}
                  </button>
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
