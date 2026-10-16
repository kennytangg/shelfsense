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
  const retained = !!(
    shelf.active_alert ||
    shelf.awaiting_verification ||
    failedPhoto
  );
  const badge = !shelf.reference
    ? "Needs setup"
    : !measurement
      ? "Not checked"
      : retained
        ? `Last measured: ${measurement}`
        : measurement;
  const action = !shelf.reference
    ? "Set up shelf"
    : shelf.awaiting_verification
      ? "Verify stock"
      : shelf.active_alert
        ? "Restock shelf"
        : "Check shelf";
  const href = `/shelves/${shelf.id}${
    !shelf.reference
      ? "/setup"
      : shelf.awaiting_verification
        ? "/check"
        : shelf.active_alert
          ? "#restocking"
          : "/check"
  }`;
  return {
    badge,
    action,
    href,
    exception: failedPhoto ? "Photo needs review" : null,
  };
}
