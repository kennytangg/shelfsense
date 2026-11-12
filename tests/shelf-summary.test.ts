import { test } from "node:test";
import assert from "node:assert/strict";
import type { Shelf } from "../src/components/api-client";
import {
  filterShelves,
  isShelfStatus,
  isShelfView,
  sortByUrgency,
  summarizeShelves,
} from "../src/components/shelf-summary";

const shelf = (name: string, fields: Partial<Shelf> = {}): Shelf =>
  ({
    id: name,
    name,
    identifier: name.toUpperCase(),
    location: "Aisle 1",
    reference: { id: "ref" },
    current: null,
    active_alert: null,
    awaiting_verification: false,
    last_error: null,
    latest_attempt: null,
    ...fields,
  }) as Shelf;
const measured = (classification: string) =>
  ({ id: "a", classification }) as Shelf["current"];
const alert = { id: "alert" } as Shelf["active_alert"];

const shelves = [
  shelf("full", { current: measured("Full") }),
  shelf("empty", { current: measured("Empty"), active_alert: alert }),
  shelf("low", { current: measured("Low"), active_alert: alert }),
  shelf("waiting", {
    current: measured("Empty"),
    awaiting_verification: true,
  }),
  shelf("fresh"),
  shelf("unset", { reference: null }),
];

test("summarizeShelves counts stock states and tasks independently", () => {
  assert.deepEqual(summarizeShelves(shelves), {
    total: 6,
    full: 1,
    low: 1,
    empty: 2,
    attention: 3,
  });
});

test("filterShelves combines attention view, stock status and search", () => {
  const names = (list: Shelf[]) => list.map((s) => s.name);
  assert.deepEqual(names(filterShelves(shelves, { view: "attention" })), [
    "empty",
    "low",
    "waiting",
  ]);
  assert.deepEqual(names(filterShelves(shelves, { status: "Empty" })), [
    "empty",
    "waiting",
  ]);
  assert.deepEqual(names(filterShelves(shelves, { search: " LOW " })), ["low"]);
  assert.deepEqual(
    names(filterShelves(shelves, { view: "attention", status: "Low" })),
    ["low"],
  );
});

test("only the attention view and stock statuses are valid URL filters", () => {
  assert.equal(isShelfView("attention"), true);
  for (const old of ["restocking", "verification", "", undefined])
    assert.equal(isShelfView(old), false);
  for (const status of ["Empty", "Low", "Full"])
    assert.equal(isShelfStatus(status), true);
  for (const old of ["Not checked", "Needs setup", undefined])
    assert.equal(isShelfStatus(old), false);
});

test("sortByUrgency puts unresolved empty shelves first without mutating input", () => {
  const copy = [...shelves];
  assert.deepEqual(
    sortByUrgency(shelves).map((s) => s.name),
    ["empty", "low", "waiting", "fresh", "unset", "full"],
  );
  assert.deepEqual(shelves, copy);
});
