import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const shelves = (name: string) =>
  resolve(root, "tests", "fixtures", "shelves", name);
const photos = (name: string) =>
  resolve(root, "e2e", "fixtures", "photos", name);

/**
 * Frozen illustrated shelf set from the repository (CC0). One shelf, same
 * viewpoint: reference (empty), low and full. They are drawings, not real
 * photographs (see docs/e2e-test-log.md, "Photos used").
 */
export const SHELF_IMAGES = {
  empty: shelves("sh-01-reference.png"),
  low: shelves("sh-01-low.png"),
  full: shelves("sh-01-full.png"),
  /** 400x640 portrait: wrong framing for the 640x400 reference. */
  mismatchedFraming: shelves("mismatched.png"),
} as const;

/** Real photographs downloaded from Wikimedia Commons. */
export const REAL_PHOTOS = {
  emptyEggShelf: photos("trader-joes-empty-egg-shelf.jpg"),
  portraitEggShelf: photos("jerusalem-empty-egg-shelf-portrait.jpg"),
} as const;

/** Monitored area that matches the frozen fixture's documented region. */
export const FIXTURE_ROI = { x: 0.05, y: 0.1, width: 0.9, height: 0.8 };
