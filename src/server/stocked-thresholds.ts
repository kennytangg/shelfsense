import { HttpError, type Settings } from "./validation";

/** Below this, the stocked photo is indistinguishable from the empty one. */
export const MIN_STOCKED_COVERAGE = 0.05;

export const STOCKED_TOO_SIMILAR_MESSAGE =
  "The stocked photo looks the same as the empty one. Use a photo of the same shelf fully stocked, from the same position.";

/**
 * Cut-offs as a share of the stocked photo's coverage F (level = coverage / F).
 * Measured on the real bookshelf frames with the whole image and with an interior area:
 * half stocked 0.52 / 0.58, empty 0.00, full again 1.07 / 1.14, mostly full 0.96 / 1.10.
 * Full at 0.75 sits near the middle of the gap, 0.2 or more from both sides.
 */
export const EMPTY_LEVEL = 0.15;
export const FULL_LEVEL = 0.75;

/** Scales the Empty and Full cut-offs to this shelf's full coverage. */
export function scaleThresholds(
  fullCoverage: number,
): Pick<Settings, "empty_threshold" | "full_threshold" | "stocked_coverage"> {
  if (!Number.isFinite(fullCoverage) || fullCoverage < MIN_STOCKED_COVERAGE)
    throw new HttpError(422, STOCKED_TOO_SIMILAR_MESSAGE);
  const coverage = Math.min(1, fullCoverage);
  return {
    empty_threshold: EMPTY_LEVEL * coverage,
    full_threshold: FULL_LEVEL * coverage,
    stocked_coverage: coverage,
  };
}
