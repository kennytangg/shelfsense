"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, Shelf, date } from "./api-client";
import { Notice, Status } from "./ui";
export function DashboardView({
  status = "",
  alerts = false,
}: {
  status?: string;
  alerts?: boolean;
}) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["shelves"],
    queryFn: () => api<Shelf[]>("/shelves"),
  });
  const shelves = query.data || [];
  const needs = shelves.filter(
    (shelf) => shelf.active_alert || shelf.awaiting_verification,
  );
  const rank = (shelf: Shelf) =>
    shelf.status === "Empty"
      ? 0
      : shelf.status === "Low"
        ? 1
        : !shelf.current
          ? 2
          : 3;
  const visible = (
    alerts
      ? needs
      : shelves.filter((shelf) => !status || shelf.status === status)
  )
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return (
    <>
      <div className="reading-container">
        <div className="section-heading">
          <h1>{alerts ? "Alerts" : "Shelves"}</h1>
          {!alerts && (
            <Link className="button" href="/shelves/new">
              Add shelf
            </Link>
          )}
        </div>
        {!alerts && (
          <>
            <p>
              {shelves.length} shelves ·{" "}
              {needs.length ? (
                <Link href="/alerts">
                  {needs.length} shelves need restocking
                </Link>
              ) : (
                "No restocking needed"
              )}
            </p>
            <form
              action="/"
              className="status-filter"
              onSubmit={(event) => {
                event.preventDefault();
                const selectedStatus = String(
                  new FormData(event.currentTarget).get("status") || "",
                );
                router.push(
                  selectedStatus
                    ? `/?status=${encodeURIComponent(selectedStatus)}`
                    : "/",
                );
              }}
            >
              <label htmlFor="shelf-status">Status</label>
              <select
                id="shelf-status"
                key={status}
                name="status"
                defaultValue={status}
              >
                <option value="">All</option>
                {["Full", "Low", "Empty"].map((shelf) => (
                  <option key={shelf}>{shelf}</option>
                ))}
              </select>
              <button className="button secondary">Apply filter</button>
            </form>
          </>
        )}
        {query.isPending && <Notice>Loading shelves…</Notice>}
        {query.isError && (
          <Notice error>
            {query.error.message}{" "}
            <button onClick={() => query.refetch()}>Retry</button>
          </Notice>
        )}
        {!query.isPending && !query.isError && !visible.length && (
          <Notice>
            {alerts ? (
              "No restocking needed."
            ) : status ? (
              <>
                <p>No shelves match this status.</p>
                <Link href="/">Show all shelves</Link>
              </>
            ) : (
              <>
                <p>
                  Add your first shelf, set it up with an empty photo, then
                  check it with a current photo.
                </p>
                <Link href="/shelves/new">Add shelf</Link>
              </>
            )}
          </Notice>
        )}
      </div>
      <div className="shelf-list">
        {visible.map((shelf) => (
          <article key={shelf.id} className="simple-card">
            <div>
              <h2>
                <Link href={`/shelves/${shelf.id}`}>{shelf.name}</Link>
              </h2>
              <p className="card-location">
                {shelf.location}
                {shelf.demo ? " · Sample shelf" : ""}
              </p>
              <Status
                status={
                  shelf.current
                    ? shelf.current.classification || shelf.status
                    : shelf.reference
                      ? "Needs first check"
                      : "Needs setup"
                }
              />
              <p className="muted">{date(shelf.current?.created_at)}</p>
              {alerts && shelf.current && (
                <figure className="alert-evidence">
                  <Link href={`/shelves/${shelf.id}`}>
                    <img
                      src={shelf.current.input.url}
                      alt={`Latest checked photo of ${shelf.name}`}
                      loading="lazy"
                    />
                  </Link>
                  <figcaption>Latest checked photo</figcaption>
                </figure>
              )}
              {alerts && !shelf.current && shelf.active_alert && (
                <p>
                  Previous {shelf.active_alert.severity} check still needs
                  restocking. Submit a fresh photo after setup.
                </p>
              )}
              {shelf.awaiting_verification && (
                <p className="card-note">
                  Restock reported · Waiting for a new photo
                </p>
              )}
              {shelf.last_error && (
                <p role="status">Latest check failed: {shelf.last_error}</p>
              )}
            </div>
            <Link
              className="button secondary"
              href={`/shelves/${shelf.id}/${shelf.reference ? "check" : "setup"}`}
            >
              {shelf.reference ? "Check shelf" : "Set up shelf"}
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
