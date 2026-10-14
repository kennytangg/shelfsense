/** Read-only photo probe. Downloaded photos and artifacts remain outside application storage. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { decode, detect } from "../src/server/shelf-analysis";
import { roiSchema, settingsSchema } from "../src/server/validation";

const [emptyPath, stockedPath, reportPath] = process.argv.slice(2);
if (!emptyPath || !stockedPath) {
  throw Error(
    "Usage: node --conditions=react-server --import tsx scripts/verify-real-photos.ts EMPTY.jpg STOCKED.jpg [REPORT.json]",
  );
}
const emptyBytes = await readFile(emptyPath);
const stockedBytes = await readFile(stockedPath);
const empty = await decode(emptyBytes);
const stocked = await decode(stockedBytes);
const settings = settingsSchema.parse({});
const roi = roiSchema.parse({});
const results: {
  name: string;
  reference: { width: number; height: number };
  current: { width: number; height: number };
  outcome: string;
  classification: string | null;
  occupancy_ratio: number | null;
  warnings: string[];
}[] = [];
async function probe(
  name: string,
  reference: Awaited<ReturnType<typeof decode>>,
  current: Awaited<ReturnType<typeof decode>>,
) {
  const result = await detect(reference, current, roi, settings);
  const summary = {
    name,
    reference: { width: reference.width, height: reference.height },
    current: { width: current.width, height: current.height },
    outcome: result.outcome,
    classification: result.classification,
    occupancy_ratio: result.occupancy_ratio,
    warnings: result.warnings,
  };
  results.push(summary);
  console.log(JSON.stringify(summary));
  return result;
}
for (const [name, image, bytes] of [
  ["mostly-empty", empty, emptyBytes],
  ["stocked", stocked, stockedBytes],
] as const) {
  const unchanged = await probe(`${name}: identical photo`, image, image);
  assert.equal(unchanged.outcome, "Valid");
  assert.equal(unchanged.classification, "Empty");
  assert.equal(unchanged.occupancy_ratio, 0);
  const compressed = await decode(
    await sharp(bytes)
      .rotate()
      .resize({ width: 1200 })
      .jpeg({ quality: 75 })
      .toBuffer(),
  );
  const repeat = await probe(`${name}: resized JPEG repeat`, image, compressed);
  assert.equal(repeat.outcome, "Valid");
  assert.equal(repeat.classification, "Empty");
  assert.ok(repeat.occupancy_ratio! < 0.15);
}
// These are different shelves. This result is an experiment, never an accuracy label.
await probe("unrelated shelves with compatible aspect ratios", empty, stocked);
const wrongFraming = await decode(
  await sharp(stockedBytes)
    .rotate()
    .resize(1200, 800, { fit: "fill" })
    .extract({ left: 0, top: 0, width: 800, height: 800 })
    .jpeg()
    .toBuffer(),
);
const rejected = await probe("unrelated square crop", empty, wrongFraming);
assert.equal(rejected.outcome, "Review required");
assert.equal(rejected.classification, null);
assert.equal(rejected.occupancy_ratio, null);
if (reportPath) {
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        sources: [
          "https://unsplash.com/photos/empty-grocery-store-shelves-VE9DQ7zm22Y",
          "https://unsplash.com/photos/shelves-stocked-with-groceries-in-a-small-store-2ae8NCoYV70",
        ],
        limitation:
          "Different shelves, not a calibrated empty/current pair. Tests prove decoding and controlled repeat behavior, not stock accuracy.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
