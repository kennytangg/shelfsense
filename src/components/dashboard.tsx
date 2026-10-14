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
  LayoutGrid,
  List,
  ScanLine,
  ArrowUpRight,
  X,
} from "lucide-react";
import { api, Dashboard, date, json, percent, Shelf, Store } from "./api";
import { Modal, Notice, Status } from "./ui";
import { UploadModal } from "./upload";

export function DashboardView() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [aisle, setAisle] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState("priority");
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
  const attentionIds = new Set(summary.data?.attention.map((s) => s.id));
  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setAisle("");
    setAttentionOnly(false);
  };
  const list = shelves.data
    ?.filter(
      (s) =>
        (!search ||
          `${s.identifier} ${s.name} ${s.location} ${s.category || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!status ||
          s.status === status ||
          (status === "Placement review" &&
            s.current?.placement_result?.status === "Placement review") ||
          (status === "Unavailable" && !s.current)) &&
        (!aisle || s.location === aisle) &&
        (!attentionOnly || attentionIds.has(s.id)),
    )
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent")
        return (b.current?.created_at || "").localeCompare(
          a.current?.created_at || "",
        );
      const priority = (s: Shelf) =>
        s.status === "Empty"
          ? 0
          : s.status === "Low"
            ? 1
            : attentionIds.has(s.id)
              ? 2
              : !s.current
                ? 3
                : 4;
      return (
        priority(a) - priority(b) || a.identifier.localeCompare(b.identifier)
      );
    });
  const cards = [
    { label: "Total zones", key: "total", filter: "", icon: Boxes },
    { label: "Full", key: "full", filter: "Full", icon: CheckCircle2 },
    { label: "Low", key: "low", filter: "Low", icon: AlertTriangle },
    { label: "Empty", key: "empty", filter: "Empty", icon: PackageOpen },
  ] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR STORE, AT A GLANCE</p>
          <h1>Shelf overview</h1>
          <p className="muted">Every shelf in sight. Know where to go next.</p>
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
            className={`summary-card ${status === card.filter && !attentionOnly ? "selected" : ""} metric-${card.key}`}
            onClick={() => {
              setStatus(card.filter);
              setAttentionOnly(false);
            }}
            aria-pressed={status === card.filter && !attentionOnly}
          >
            <span>
              {card.label}
              <card.icon size={18} />
            </span>
            <strong>{summary.data?.[card.key] ?? "—"}</strong>
            <small>
              {card.key === "total"
                ? "Across your store"
                : card.key === "full"
                  ? "Sufficient visible coverage"
                  : card.key === "low"
                    ? "Ready for a restock"
                    : "Needs attention first"}
            </small>
          </button>
        ))}
      </div>
      <div className="review-strip">
        <span>
          <ScanLine size={16} />
          Beyond stock levels
        </span>
        <button
          onClick={() => {
            setStatus("Placement review");
            setAttentionOnly(false);
          }}
          aria-pressed={status === "Placement review"}
        >
          <AlertTriangle size={15} />
          Placement review{" "}
          <strong>{summary.data?.placement_review ?? "—"}</strong>
        </button>
        <button
          onClick={() => {
            setStatus("Unavailable");
            setAttentionOnly(false);
          }}
          aria-pressed={status === "Unavailable"}
        >
          <CircleDashed size={15} />
          No valid reading <strong>{summary.data?.unavailable ?? "—"}</strong>
        </button>
      </div>
      <section className="attention" id="attention">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LET’S START HERE</p>
            <h2>
              Attention needed{" "}
              <span className="count">
                {summary.data?.attention.length ?? "—"}
              </span>
            </h2>
          </div>
          <button
            className="button secondary small"
            onClick={() => {
              clearFilters();
              setAttentionOnly(true);
              document
                .getElementById("zones")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            View queue <ArrowRight size={15} />
          </button>
        </div>
        {summary.data?.attention.length === 0 && (
          <div className="empty-state compact">
            <CheckCircle2 size={26} />
            <div>
              <strong>You’re all caught up.</strong>
              <p>
                No shelves are currently in the attention queue. Check unread
                zones for a complete picture.
              </p>
            </div>
          </div>
        )}
        <div className="attention-grid">
          {summary.data?.attention.slice(0, 4).map((s, index) => (
            <Link
              href={`/shelves/${s.id}`}
              key={s.id}
              className="attention-item"
            >
              <span className="queue-rank">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="queue-info">
                <strong>{s.name}</strong>
                <span>
                  {s.identifier} · {s.location}
                </span>
                <small>
                  {s.awaiting_verification
                    ? "Awaiting verification"
                    : s.current?.placement_result?.status === "Placement review"
                      ? "Inspect product placement"
                      : `${s.active_alert?.state || "Restock"} · ${percent(s.current?.occupancy_ratio)} occupied`}
                </small>
              </div>
              <Status status={s.status} />
              <ArrowUpRight size={17} className="queue-arrow" />
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
      <section className="shelves-section" id="zones">
        <div className="section-heading">
          <div>
            <h2>
              Your shelf zones{" "}
              <span className="count">{list?.length ?? "—"}</span>
            </h2>
            <p className="muted small-text">
              Latest saved readings across your store.
            </p>
          </div>
          <div className="view-switch" aria-label="Shelf display">
            <button
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={17} />
            </button>
          </div>
        </div>
        <div className="filters">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search shelves"
              placeholder="Find a shelf, aisle, or category…"
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
          <select
            aria-label="Sort shelves"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="priority">Priority first</option>
            <option value="name">Name A–Z</option>
            <option value="recent">Latest check</option>
          </select>
        </div>
        {(search || status || aisle || attentionOnly) && (
          <div className="active-filters">
            <span>
              {list?.length ?? 0} matching zones
              {attentionOnly ? " · Attention queue" : ""}
              {status ? ` · ${status}` : ""}
            </span>
            <button className="text-button" onClick={clearFilters}>
              <X size={13} />
              Clear filters
            </button>
          </div>
        )}
        {shelves.isPending && <Notice>Loading saved shelf checks…</Notice>}
        {list?.length === 0 && (
          <div className="empty-state">
            <Boxes size={32} />
            <h3>
              {shelves.data?.length === 0
                ? "Your first shelf starts here."
                : "No shelves found."}
            </h3>
            <p>
              {shelves.data?.length === 0
                ? "Add a zone, save an empty reference, and upload your first check."
                : "Try another name, aisle, or status."}
            </p>
            <button
              className="button secondary"
              onClick={
                shelves.data?.length === 0
                  ? () => setAdding(true)
                  : clearFilters
              }
            >
              {shelves.data?.length === 0 ? "Add shelf" : "Clear filters"}
            </button>
          </div>
        )}
        <div className={`shelf-grid ${view === "list" ? "shelf-list" : ""}`}>
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
                  <span>Visible coverage</span>
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
                        (s.current
                          ? "No active task"
                          : s.reference
                            ? "Ready for first check"
                            : "Setup needed")}
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
        <ScanLine size={16} />
        Visible occupied area is a shelf-fullness proxy, not a product count.
        Full means sufficient visible coverage for this demo.
      </footer>
      {upload && <UploadModal shelf={upload} close={() => setUpload(null)} />}
      {adding && (
        <Modal title="Add a shelf zone" close={() => setAdding(false)}>
          <ol className="step-strip" aria-label="New shelf setup">
            <li className="current">
              <span>01</span>Name your zone
            </li>
            <li>
              <span>02</span>Calibrate
            </li>
            <li>
              <span>03</span>First photo
            </li>
          </ol>
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
