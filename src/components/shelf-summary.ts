import type { Shelf } from "./api-client";
import { shelfPresentation } from "./shelf-presentation";

export type ShelfView = "" | "restocking" | "verification" | "attention";
export const SHELF_STATUSES = [
  "Empty",
  "Low",
  "Full",
  "Not checked",
  "Needs setup",
] as const;
export type ShelfStatus = (typeof SHELF_STATUSES)[number];
export type ShelfFilter = {
  view?: ShelfView;
  status?: string;
  search?: string;
};

export const isShelfView = (value: string | undefined): value is ShelfView =>
  ["restocking", "verification", "attention"].includes(value ?? "");
export const isShelfStatus = (
  value: string | undefined,
): value is ShelfStatus =>
  (SHELF_STATUSES as readonly string[]).includes(value ?? "");

const badge = (shelf: Shelf) => shelfPresentation(shelf).badge;
const needsAttention = (shelf: Shelf) =>
  !!shelf.active_alert || shelf.awaiting_verification;

export function summarizeShelves(shelves: Shelf[]) {
  const count = (status: ShelfStatus) =>
    shelves.filter((shelf) => badge(shelf) === status).length;
  return {
    total: shelves.length,
    full: count("Full"),
    low: count("Low"),
    empty: count("Empty"),
    notChecked: count("Not checked"),
    needsSetup: count("Needs setup"),
    restocking: shelves.filter((shelf) => !!shelf.active_alert).length,
    verification: shelves.filter((shelf) => shelf.awaiting_verification).length,
    attention: shelves.filter(needsAttention).length,
  };
}

export function filterShelves(shelves: Shelf[], filter: ShelfFilter) {
  const search = (filter.search ?? "").trim().toLowerCase();
  return shelves.filter((shelf) => {
    if (filter.view === "restocking" && !shelf.active_alert) return false;
    if (filter.view === "verification" && !shelf.awaiting_verification)
      return false;
    if (filter.view === "attention" && !needsAttention(shelf)) return false;
    if (filter.status && badge(shelf) !== filter.status) return false;
    return (
      !search ||
      `${shelf.name} ${shelf.identifier} ${shelf.location}`
        .toLowerCase()
        .includes(search)
    );
  });
}

const rank = (shelf: Shelf) => {
  if (shelf.awaiting_verification) return 2;
  const order: Record<string, number> = {
    Empty: 0,
    Low: 1,
    "Not checked": 3,
    "Needs setup": 4,
    Full: 5,
  };
  return order[badge(shelf)] ?? 5;
};

/** Most urgent first; ties fall back to name. Returns a new array. */
export const sortByUrgency = (shelves: Shelf[]) =>
  [...shelves].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
