import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { decode, detect } from "../src/server/shelf-analysis";
import { roiSchema, settingsSchema } from "../src/server/validation";

// Local-only: the photos are all-rights-reserved and never committed (see .gitignore).
const dir = "local-samples/real-bookshelf/";
const present = existsSync(dir + "01-empty-reference.jpg");
const roi = roiSchema.parse({ x: 0.26, y: 0.235, width: 0.5, height: 0.71 });
// A fully stocked row of books covers about a third of this tall ROI (the rest is wall),
// so the Full threshold is set per shelf from that capacity (about 85% of it).
const settings = settingsSchema.parse({
  empty_threshold: 0.05,
  full_threshold: 0.28,
});
const CASES = [
  ["02-empty-again.jpg", "Empty"],
  ["03-half.jpg", "Low"],
  ["04-full.jpg", "Full"],
  ["05-full-again.jpg", "Full"],
] as const;

async function measure(file: string) {
  const reference = await decode(
    await readFile(dir + "01-empty-reference.jpg"),
  );
  return detect(
    reference,
    await decode(await readFile(dir + file)),
    roi,
    settings,
  );
}
for (const [file, expected] of CASES)
  test(
    `real bookshelf ${file} is ${expected}`,
    { skip: present ? false : "local-samples/real-bookshelf not present" },
    async () => {
      const result = await measure(file);
      assert.equal(result.outcome, "Valid");
      assert.equal(result.classification, expected);
    },
  );
test(
  "real bookshelf: two visually identical full frames agree despite exposure change",
  { skip: present ? false : "local-samples/real-bookshelf not present" },
  async () => {
    const [a, b] = await Promise.all([
      measure("04-full.jpg"),
      measure("05-full-again.jpg"),
    ]);
    assert.ok(Math.abs(a.occupancy_ratio! - b.occupancy_ratio!) < 0.08);
  },
);

test(
  "real bookshelf: calibrating from the full photo classifies the other frames",
  { skip: present ? false : "local-samples/real-bookshelf not present" },
  async () => {
    const { scaleThresholds } = await import(
      "../src/server/stocked-thresholds"
    );
    const full = await measure("04-full.jpg");
    const calibrated = settingsSchema.parse(
      scaleThresholds(full.occupancy_ratio!),
    );
    const reference = await decode(
      await readFile(dir + "01-empty-reference.jpg"),
    );
    for (const [file, expected] of [
      ["02-empty-again.jpg", "Empty"],
      ["03-half.jpg", "Low"],
      ["05-full-again.jpg", "Full"],
    ] as const) {
      const r = await detect(
        reference,
        await decode(await readFile(dir + file)),
        roi,
        calibrated,
      );
      assert.equal(r.classification, expected, file);
    }
    const mostlyFull = await detect(
      reference,
      await decode(await readFile(dir + "07-mostly-full.jpg")),
      roi,
      calibrated,
    );
    // Measured: F 0.3187, 07 covers 0.3048 (about 96% of F), above Full at 0.1912.
    assert.equal(mostlyFull.classification, "Full");
  },
);
