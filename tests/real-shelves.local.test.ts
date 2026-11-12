import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_LEVEL, FULL_LEVEL } from "../src/server/stocked-thresholds";
import {
  REAL_SETS,
  WHOLE_IMAGE,
  hasSet,
  measureSet,
} from "./support/real-shelves";

// Local-only: the photos are all-rights-reserved and never committed (see .gitignore).
// Each set is one entry in tests/support/real-shelves.ts; a missing folder skips that set.
// Informational sets are measured but never gate.
for (const set of REAL_SETS) {
  const present = hasSet(set);
  for (const [label, area] of [
    ["whole image (default)", WHOLE_IMAGE],
    ["tight area", set.tight],
  ] as const) {
    const skip = !present ? `${set.folder} not present` : false;
    test(
      `${set.name}, ${label}: every frame reads as labelled`,
      { skip },
      async () => {
        const { full, rows } = await measureSet(set, area);
        assert.ok(full > 0.05, "stocked photo must read clearly above empty");
        for (const r of rows) {
          assert.equal(r.outcome, "Valid", r.file);
          assert.equal(
            r.status,
            r.expected,
            `${r.file}: level ${r.level?.toFixed(3)}`,
          );
          // Stay clear of the cut-offs so small lighting noise cannot flip a frame.
          if (r.expected === "Empty")
            assert.ok(r.level! <= EMPTY_LEVEL - 0.04, r.file);
          if (r.expected === "Full")
            assert.ok(r.level! >= FULL_LEVEL + 0.02, r.file);
          if (r.expected === "Low") {
            assert.ok(
              r.level! >= EMPTY_LEVEL + 0.04,
              `${r.file} too near Empty`,
            );
            assert.ok(r.level! <= FULL_LEVEL - 0.03, `${r.file} too near Full`);
          }
        }
      },
    );
  }
}
