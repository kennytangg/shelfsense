"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Plus,
  Search,
  Upload,
  Play,
  MapPin,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  PackageOpen,
  CircleDashed,
} from "lucide-react";
import { api, Dashboard, date, json, percent, Shelf, Store } from "./api";
import { Modal, Notice, Status } from "./ui";
import { UploadModal } from "./upload";

export function DashboardView() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [aisle, setAisle] = useState("");
  const [adding, setAdding] = useState(false);
  const [upload, setUpload] = useState<Shelf | null>(null);
  const store = useQuery({
    queryKey: ["store"],
    queryFn: () => api<Store>("/store"),
  });
  const summary = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/dashboard"),
  });
  const shelves = useQuery({
    queryKey: ["shelves"],
    queryFn: () => api<Shelf[]>("/shelves"),
  });
  const add = useMutation({
    mutationFn: (data: unknown) => api<Shelf>("/shelves", json(data)),
    onSuccess: async (shelf) => {
      await client.invalidateQueries();
      window.location.assign(`/shelves/${shelf.id}?setup=1`);
    },
  });
  const demoShelf = shelves.data?.find(
    (s) => s.identifier === "SH-01" && s.demo,
  );
  const list = shelves.data?.filter(
    (s) =>
      (!search ||
        `${s.identifier} ${s.name}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!status ||
        s.status === status ||
        (status === "Placement review" &&
          s.current?.placement_result?.status === "Placement review") ||
        (status === "Unavailable" && !s.current)) &&
      (!aisle || s.location === aisle),
  );
  const cards = [
    { label: "Total zones", key: "total", filter: "", icon: Boxes },
    { label: "Full", key: "full", filter: "Full", icon: CheckCircle2 },
    { label: "Low", key: "low", filter: "Low", icon: AlertTriangle },
    { label: "Empty", key: "empty", filter: "Empty", icon: PackageOpen },
    {
      label: "Placement review",
      key: "placement_review",
      filter: "Placement review",
      icon: AlertTriangle,
    },
    {
      label: "No valid reading",
      key: "unavailable",
      filter: "Unavailable",
      icon: CircleDashed,
    },
  ] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <MapPin size={13} />
            {store.data?.name || "ShelfSense store"}
          </p>
          <h1>Shelf overview</h1>
          <p className="muted">
            See what needs attention. Keep your shelves ready.
          </p>
        </div>
        <div className="actions">
          {demoShelf && (
            <Link
              className="button secondary"
              href={`/shelves/${demoShelf.id}#demo`}
            >
              <Play size={16} />
              Run a demo
            </Link>
          )}
          <button className="button" onClick={() => setAdding(true)}>
            <Plus size={18} />
            Add shelf
          </button>
        </div>
      </div>
      {(shelves.error || summary.error || store.error) && (
        <Notice error>
          {(shelves.error || summary.error || store.error)?.message}{" "}
          <button
            className="text-button"
            onClick={() => client.invalidateQueries()}
          >
            Retry
          </button>
        </Notice>
      )}
      <div className="summary-grid">
        {cards.map((card) => (
          <button
            key={card.key}
            className={`summary-card ${status === card.filter ? "selected" : ""} metric-${card.key}`}
            onClick={() => setStatus(card.filter)}
            aria-pressed={status === card.filter}
          >
            <span>
              {card.label}
              <card.icon size={18} />
            </span>
            <strong>{summary.data?.[card.key] ?? "—"}</strong>
            <small>
              {card.key === "unavailable"
                ? "Setup, unchecked or review"
                : card.key === "total"
                  ? "Monitored shelf zones"
                  : "Latest valid checks"}
            </small>
          </button>
        ))}
      </div>
      <section className="attention">
        <div className="section-heading">
          <h2>
            <AlertTriangle size={18} />
            Attention needed{" "}
            <span className="count">
              {summary.data?.attention.length ?? "—"}
            </span>
          </h2>
          <span className="muted">Empty zones first</span>
        </div>
        {summary.data?.attention.length === 0 && (
          <p>All checked zones have sufficient visible coverage.</p>
        )}
        <div className="attention-grid">
          {summary.data?.attention.slice(0, 4).map((s) => (
            <Link
              href={`/shelves/${s.id}`}
              key={s.id}
              className="attention-item"
            >
              <Status status={s.status} />
              <strong>{s.name}</strong>
              <span>
                {s.identifier} · {s.location}
              </span>
              <div className="attention-bottom">
                <small>
                  {s.awaiting_verification
                    ? "Awaiting verification"
                    : s.current?.placement_result?.status === "Placement review"
                      ? "Inspect product placement"
                      : `${s.active_alert?.state || "Restock"} · ${percent(s.current?.occupancy_ratio)} occupied`}
                </small>
                <ArrowRight size={16} />
              </div>
            </Link>
          ))}
        </div>
        {(summary.data?.attention.length || 0) > 4 && (
          <p className="muted small-text">
            All {summary.data?.attention.length} zones needing attention are
            listed below, ordered by urgency.
          </p>
        )}
      </section>
      <section className="shelves-section">
        <div className="section-heading">
          <h2>
            Monitored zones <span className="count">{list?.length ?? "—"}</span>
          </h2>
          <span className="muted small-text">
            Synthetic demo images are labeled
          </span>
        </div>
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search shelves"
              placeholder="Search by shelf name or identifier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {[
              "Full",
              "Low",
              "Empty",
              "Placement review",
              "Unavailable",
              "Needs setup",
              "Not checked",
              "Review required",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filter by aisle"
            value={aisle}
            onChange={(e) => setAisle(e.target.value)}
          >
            <option value="">All aisles</option>
            {Array.from(new Set(shelves.data?.map((s) => s.location)))
              .sort()
              .map((a) => (
                <option key={a}>{a}</option>
              ))}
          </select>
        </div>
        {shelves.isPending && <Notice>Loading saved shelf checks…</Notice>}
        {list?.length === 0 && (
          <Notice>
            No shelves match. Clear the filters or add a shelf to get started.
          </Notice>
        )}
        <div className="shelf-grid">
          {list?.map((s) => (
            <article className="shelf-card" key={s.id}>
              <Link href={`/shelves/${s.id}`} className="shelf-image">
                {s.current?.input || s.reference ? (
                  <img
                    src={(s.current?.input || s.reference)!.url}
                    alt={`${s.name} shelf zone`}
                  />
                ) : (
                  <div className="image-placeholder">
                    <Boxes size={36} />
                    <span>Add an empty reference</span>
                  </div>
                )}
                {s.demo && (
                  <span className="synthetic-label">Synthetic demo</span>
                )}
              </Link>
              <div className="shelf-body">
                <div className="section-heading">
                  <span className="shelf-code">{s.identifier}</span>
                  <Status status={s.status} />
                </div>
                <h3>
                  <Link href={`/shelves/${s.id}`}>{s.name}</Link>
                </h3>
                <p className="location">
                  <MapPin size={13} />
                  {s.location}
                </p>
                <div className="coverage">
                  <span>Estimated occupied area</span>
                  <strong>{percent(s.current?.occupancy_ratio)}</strong>
                </div>
                <div className="meter">
                  <div
                    className={`fill-${s.status.toLowerCase()}`}
                    style={{
                      width: `${(s.current?.occupancy_ratio || 0) * 100}%`,
                    }}
                  />
                </div>
                <div className="check-meta">
                  <span>{date(s.current?.created_at)}</span>
                  <strong>
                    {s.awaiting_verification
                      ? "Awaiting verification"
                      : s.active_alert?.state ||
                        (s.current ? "No active task" : "Setup needed")}
                  </strong>
                </div>
                {s.current?.placement_result?.status === "Placement review" && (
                  <p className="card-warning">
                    Possible misplaced items. Inspect the expected layout and
                    orange overlay.
                  </p>
                )}
                {s.last_error && (
                  <p className="card-warning">
                    Latest attempt needs review.{" "}
                    {s.current
                      ? "Previous valid reading shown."
                      : "Open details for guidance."}
                  </p>
                )}
                <div className="card-actions">
                  {s.reference ? (
                    <button
                      className="button secondary small"
                      onClick={() => setUpload(s)}
                    >
                      <Upload size={14} />
                      Upload image
                    </button>
                  ) : (
                    <Link
                      className="button secondary small"
                      href={`/shelves/${s.id}?setup=1`}
                    >
                      Set up zone
                    </Link>
                  )}
                  <Link href={`/shelves/${s.id}`} className="details-link">
                    View details
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <footer className="page-footer">
        Visible occupied area is a shelf-fullness proxy, not a product count.
        Full means sufficient visible coverage for this demo.
      </footer>
      {upload && <UploadModal shelf={upload} close={() => setUpload(null)} />}
      {adding && (
        <Modal title="Add a shelf zone" close={() => setAdding(false)}>
          <p className="muted">
            One zone per record. You’ll calibrate its empty reference next.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(Object.fromEntries(new FormData(e.currentTarget)));
            }}
          >
            <div className="form-grid">
              <label>
                Identifier
                <input
                  name="identifier"
                  required
                  maxLength={40}
                  pattern="[A-Za-z0-9_-]+"
                  placeholder="SH-13"
                />
              </label>
              <label>
                Display name
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Breakfast cereals"
                />
              </label>
              <label>
                Aisle / location
                <input
                  name="location"
                  required
                  maxLength={120}
                  placeholder="01 · Breakfast"
                />
              </label>
              <label>
                Category (optional)
                <input
                  name="category"
                  maxLength={120}
                  placeholder="Groceries"
                />
              </label>
            </div>
            {add.isError && <Notice error>{add.error.message}</Notice>}
            <button className="button" disabled={add.isPending}>
              {add.isPending ? "Creating…" : "Create & calibrate"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
