import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { decode, detect, type RGB } from "../src/server/shelf-analysis";
import { scaleThresholds } from "../src/server/stocked-thresholds";
import { roiSchema, settingsSchema } from "../src/server/validation";

// Local-only: the photos are all-rights-reserved and never committed (see .gitignore).
const dir = "local-samples/real-bookshelf/";
const present = existsSync(dir + "01-empty-reference.jpg");
const skip = present ? false : "local-samples/real-bookshelf not present";
const ROIS = {
  "whole image (default)": roiSchema.parse({ x: 0, y: 0, width: 1, height: 1 }),
  "interior area": roiSchema.parse({
    x: 0.26,
    y: 0.235,
    width: 0.5,
    height: 0.71,
  }),
};
const EXPECTED = [
  ["02-empty-again.jpg", "Empty"],
  ["03-half.jpg", "Low"],
  ["05-full-again.jpg", "Full"],
  ["07-mostly-full.jpg", "Full"],
] as const;

const images = new Map<string, RGB>();
async function load(file: string) {
  if (!images.has(file))
    images.set(file, await decode(await readFile(dir + file)));
  return images.get(file)!;
}

/** Calibrates exactly like setup does: 01 is the empty reference, 04 the stocked photo. */
async function calibrate(roi: (typeof ROIS)[keyof typeof ROIS]) {
  const reference = await load("01-empty-reference.jpg");
  const base = settingsSchema.parse({});
  const stocked = await detect(reference, await load("04-full.jpg"), roi, base);
  assert.equal(stocked.outcome, "Valid");
  const settings = settingsSchema.parse({
    ...scaleThresholds(stocked.occupancy_ratio!),
  });
  return { reference, settings, full: stocked.occupancy_ratio! };
}

for (const [name, roi] of Object.entries(ROIS)) {
  test(
    `real bookshelf, ${name}: Empty, Low, Full, Full with margin`,
    { skip },
    async () => {
      const { reference, settings, full } = await calibrate(roi);
      assert.ok(full > 0.05, "stocked photo must read clearly above empty");
      const level: Record<string, number> = {};
      for (const [file, expected] of EXPECTED) {
        const r = await detect(reference, await load(file), roi, settings);
        assert.equal(r.outcome, "Valid", file);
        assert.equal(r.classification, expected, file);
        level[file] = r.occupancy_ratio! / full;
      }
      assert.ok(level["02-empty-again.jpg"] <= 0.05, "empty level");
      assert.ok(level["03-half.jpg"] <= 0.7, "half level");
      assert.ok(level["05-full-again.jpg"] >= 0.9, "full level");
      assert.ok(level["07-mostly-full.jpg"] >= 0.9, "mostly full level");
      assert.ok(
        level["03-half.jpg"] < level["05-full-again.jpg"] - 0.25,
        "half is clearly below full",
      );
    },
  );
}
