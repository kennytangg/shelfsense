import { test } from "node:test";
import assert from "node:assert/strict";
import type { Shelf } from "../src/components/api-client";
import { shelfPresentation } from "../src/components/shelf-presentation";
const shelf = (fields: Partial<Shelf> = {}): Shelf =>
  ({
    id: "test",
    reference: { id: "ref" },
    current: { id: "valid", classification: "Empty" },
    active_alert: null,
    awaiting_verification: false,
    last_error: null,
    latest_attempt: null,
    ...fields,
  }) as Shelf;
test("setup determines route even when historical tasks and errors remain", () => {
  assert.deepEqual(
    shelfPresentation(
      shelf({
        reference: null,
        active_alert: { id: "alert" } as Shelf["active_alert"],
        awaiting_verification: true,
        last_error: "invalid photo",
      }),
    ),
    {
      badge: "Needs setup",
      action: "Set up shelf",
      href: "/shelves/test/setup",
      exception: "Photo needs review",
    },
  );
});
test("stock classifications retain their meaning independently of pending tasks", () => {
  for (const classification of ["Full", "Low", "Empty"]) {
    const current = { id: "valid", classification } as Shelf["current"];
    assert.equal(shelfPresentation(shelf({ current })).badge, classification);
    const pending = shelfPresentation(
      shelf({ current, awaiting_verification: true }),
    );
    assert.equal(pending.badge, classification);
    assert.equal(pending.action, "Verify restock");
    assert.equal(pending.exception, null);
  }
});
test("failed latest photo retains measurement and stock check action with one exception", () => {
  const presentation = shelfPresentation(
    shelf({
      awaiting_verification: true,
      active_alert: { id: "alert" } as Shelf["active_alert"],
      latest_attempt: {
        id: "review",
        outcome: "Needs review",
      } as Shelf["latest_attempt"],
    }),
  );
  assert.deepEqual(presentation, {
    badge: "Empty",
    action: "Verify restock",
    href: "/shelves/test/check",
    exception: "Photo needs review",
  });
});
test("restocking action opens the staff report controls", () => {
  assert.deepEqual(
    shelfPresentation(
      shelf({ active_alert: { id: "alert" } as Shelf["active_alert"] }),
    ),
    {
      badge: "Empty",
      action: "Restock shelf",
      href: "/shelves/test#restocking",
      exception: null,
    },
  );
});
test("missing current result is never replaced by stale shelf status", () => {
  for (const awaiting_verification of [false, true]) {
    const presentation = shelfPresentation(
      shelf({
        current: null,
        status: "Full",
        awaiting_verification,
        last_error: "review",
      }),
    );
    assert.equal(presentation.badge, "Not checked");
    assert.equal(
      presentation.action,
      awaiting_verification ? "Verify restock" : "Check stock",
    );
    assert.equal(presentation.exception, "Photo needs review");
  }
});
