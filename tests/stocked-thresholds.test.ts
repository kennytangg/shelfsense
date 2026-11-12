import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decode, detect, classify } from "../src/server/shelf-analysis";
import {
  EMPTY_LEVEL,
  FULL_LEVEL,
  scaleThresholds,
} from "../src/server/stocked-thresholds";
import { settingsSchema, roiSchema } from "../src/server/validation";

test("scaleThresholds scales the defaults to the full coverage", () => {
  const s = scaleThresholds(0.33);
  assert.equal(EMPTY_LEVEL, 0.11);
  assert.equal(FULL_LEVEL, 0.75);
  assert.ok(Math.abs(s.empty_threshold - 0.0363) < 1e-12);
  assert.ok(Math.abs(s.full_threshold - 0.2475) < 1e-12);
  assert.equal(s.stocked_coverage, 0.33);
  assert.doesNotThrow(() =>
    settingsSchema.parse({ ...s, difference_threshold: 28 }),
  );
});
test("scaleThresholds with full coverage 1 gives the levels themselves", () => {
  const s = scaleThresholds(1);
  assert.equal(s.empty_threshold, EMPTY_LEVEL);
  assert.equal(s.full_threshold, FULL_LEVEL);
});
test("scaleThresholds rejects a stocked photo that looks empty", () => {
  for (const f of [0, 0.049, Number.NaN])
    assert.throws(() => scaleThresholds(f), /looks the same as the empty one/);
  assert.doesNotThrow(() => scaleThresholds(0.05));
});
test("drawn fixtures classify correctly when calibrated from the full photo", async () => {
  const read = (n: string) => readFile(`tests/fixtures/shelves/${n}.png`);
  const reference = await decode(await read("sh-01-reference"));
  const roi = roiSchema.parse({ x: 0.05, y: 0.1, width: 0.9, height: 0.8 });
  const base = settingsSchema.parse({});
  const full = await detect(
    reference,
    await decode(await read("sh-01-full")),
    roi,
    base,
  );
  const calibrated = settingsSchema.parse({
    ...scaleThresholds(full.occupancy_ratio!),
  });
  const expected = {
    "sh-01-reference": "Empty",
    "sh-01-low": "Low",
    "sh-01-full": "Full",
  };
  for (const [name, label] of Object.entries(expected)) {
    const r = await detect(
      reference,
      await decode(await read(name)),
      roi,
      calibrated,
    );
    assert.equal(classify(r.occupancy_ratio!, calibrated), label, name);
  }
});
