import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { decode, detect, type RGB } from "../src/server/shelf-analysis";
import { settingsSchema } from "../src/server/validation";

const settings = settingsSchema.parse({});
const dir = "tests/fixtures/shelves/";
const manifest = JSON.parse(await readFile(dir + "manifest.json", "utf8"));

type Tone = { gain: [number, number, number]; offset: number };
const NEUTRAL: Tone = { gain: [1, 1, 1], offset: 0 };

/** Global per-channel gain plus black offset, as an exposure/white-balance change would apply. */
async function toned(file: string, { gain, offset }: Tone): Promise<RGB> {
  const bytes = await sharp(await readFile(dir + file))
    .recomb([
      [gain[0], 0, 0],
      [0, gain[1], 0],
      [0, 0, gain[2]],
    ])
    .linear(1, offset)
    .png()
    .toBuffer();
  return decode(bytes);
}
// The fixtures have near-white margins, so brightening is simulated by darkening the reference.
const PERTURBATIONS: { label: string; reference: Tone; current: Tone }[] = [
  {
    label: "brighter exposure (+33%)",
    reference: { gain: [0.75, 0.75, 0.75], offset: 0 },
    current: NEUTRAL,
  },
  {
    label: "darker exposure (-30%)",
    reference: NEUTRAL,
    current: { gain: [0.7, 0.7, 0.7], offset: 0 },
  },
  {
    label: "colour cast with lifted blacks",
    reference: NEUTRAL,
    current: { gain: [0.95, 0.85, 0.75], offset: 5 },
  },
];

for (const entry of manifest.shelves) {
  for (const { label, reference: refTone, current: curTone } of PERTURBATIONS) {
    for (const [name, sample] of Object.entries(entry.samples) as [
      string,
      { file: string; expected: string },
    ][]) {
      if (name === "mismatched") continue;
      test(`${entry.identifier} ${name} stays ${sample.expected} under ${label}`, async () => {
        const reference = await toned(entry.reference, refTone);
        const current = await toned(sample.file, curTone);
        const result = await detect(reference, current, entry.roi, settings);
        assert.equal(result.outcome, "Valid", result.warnings.join(" "));
        assert.equal(result.classification, sample.expected);
      });
    }
  }
}
