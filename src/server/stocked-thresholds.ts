import {
  DEFAULT_EMPTY_THRESHOLD,
  DEFAULT_FULL_THRESHOLD,
  HttpError,
  type Settings,
} from "./validation";

/** Below this, the stocked photo is indistinguishable from the empty one. */
export const MIN_STOCKED_COVERAGE = 0.05;

export const STOCKED_TOO_SIMILAR_MESSAGE =
  "The stocked photo looks the same as the empty one. Use a photo of the same shelf fully stocked, from the same position.";

/** Scales the default Empty and Full thresholds to this shelf's full coverage. */
export function scaleThresholds(
  fullCoverage: number,
): Pick<Settings, "empty_threshold" | "full_threshold" | "stocked_coverage"> {
  if (!Number.isFinite(fullCoverage) || fullCoverage < MIN_STOCKED_COVERAGE)
    throw new HttpError(422, STOCKED_TOO_SIMILAR_MESSAGE);
  const coverage = Math.min(1, fullCoverage);
  return {
    empty_threshold: DEFAULT_EMPTY_THRESHOLD * coverage,
    full_threshold: DEFAULT_FULL_THRESHOLD * coverage,
    stocked_coverage: coverage,
  };
}
