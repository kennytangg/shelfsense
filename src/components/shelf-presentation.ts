import type { Shelf } from "./api-client";

/** Measurement, task and latest-photo state are independent persisted facts. */
export function shelfPresentation(shelf: Shelf) {
  const measurement = shelf.current?.classification || null;
  const failedPhoto = !!(
    shelf.last_error ||
    (shelf.latest_attempt &&
      shelf.latest_attempt.outcome !== "Valid" &&
      shelf.latest_attempt.id !== shelf.current?.id)
  );
  const badge = !shelf.reference ? "Needs setup" : measurement || "Not checked";
  const action = !shelf.reference
    ? "Set up shelf"
    : shelf.awaiting_verification
      ? "Verify restock"
      : shelf.active_alert
        ? "Restock shelf"
        : "Check stock";
  const href = !shelf.reference
    ? `/shelves/${shelf.id}/setup`
    : shelf.awaiting_verification
      ? `/shelves/${shelf.id}/check`
      : shelf.active_alert
        ? `/shelves/${shelf.id}#restocking`
        : `/shelves/${shelf.id}/check`;
  return {
    badge,
    action,
    href,
    exception: failedPhoto ? "Photo needs review" : null,
  };
}
