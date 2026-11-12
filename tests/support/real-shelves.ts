import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { decode, detect, type RGB } from "../../src/server/shelf-analysis";
import { scaleThresholds } from "../../src/server/stocked-thresholds";
import { roiSchema, settingsSchema } from "../../src/server/validation";

export type Status = "Empty" | "Low" | "Full";
export type RealSet = {
  name: string;
  folder: string;
  reference: string;
  stocked: string;
  /** Informational sets are measured and printed but never gate a test. */
  gated: boolean;
  /** Tight monitored area (area B), normalised x/y/width/height. */
  tight: { x: number; y: number; width: number; height: number };
  /** A true third element marks a borderline frame: measured and printed, never gating. */
  frames: readonly (
    | readonly [file: string, expected: Status]
    | readonly [file: string, expected: Status, informational: true]
  )[];
};

/** Adding a new real photo set is one entry here (photos are git-ignored). */
export const REAL_SETS: readonly RealSet[] = [
  {
    name: "real-bookshelf",
    folder: "local-samples/real-bookshelf/",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    gated: true,
    tight: { x: 0.26, y: 0.235, width: 0.5, height: 0.71 },
    frames: [
      ["02-empty-again.jpg", "Empty"],
      ["03-half.jpg", "Low"],
      ["05-full-again.jpg", "Full"],
      ["07-mostly-full.jpg", "Full"],
    ],
  },
  {
    name: "fridge",
    folder: "local-samples/fridge/",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    gated: true,
    tight: { x: 0.01, y: 0.03, width: 0.98, height: 0.94 },
    frames: [
      ["02-empty-again.jpg", "Empty"],
      ["07-low-2.jpg", "Low"],
      ["03-low.jpg", "Low"],
      ["06-mostly-full.jpg", "Full"],
      ["05-full-again.jpg", "Full"],
    ],
  },
  {
    name: "pantry",
    folder: "local-samples/pantry/",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    gated: true,
    tight: { x: 0.22, y: 0.08, width: 0.45, height: 0.92 },
    frames: [
      ["08-low-left-bay.jpg", "Low"],
      ["03-low.jpg", "Low"],
      ["07-low-2.jpg", "Low"],
      ["05-full-again.jpg", "Full"],
    ],
  },
  {
    name: "shoebox-stop-motion",
    folder: "local-samples/shoebox-stop-motion/",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    gated: true,
    tight: { x: 0.13, y: 0.02, width: 0.65, height: 0.96 },
    frames: [
      ["02-empty-again.jpg", "Empty"],
      ["03-low.jpg", "Low"],
      ["07-low-2.jpg", "Low"],
      ["06-mostly-full.jpg", "Full"],
      ["05-full-again.jpg", "Full"],
    ],
  },
  {
    name: "shoe-rack-stop-motion",
    folder: "local-samples/shoe-rack-stop-motion/",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    gated: true,
    tight: { x: 0.08, y: 0.02, width: 0.84, height: 0.96 },
    frames: [
      ["03-low.jpg", "Low", true],
      ["07-low-2.jpg", "Low", true],
      ["08-mid.jpg", "Low"],
      ["06-mostly-full.jpg", "Full"],
      ["05-full-again.jpg", "Full"],
    ],
  },
  {
    name: "store-shelf",
    folder: "local-samples/store-shelf/",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    gated: false,
    tight: { x: 0.35, y: 0.15, width: 0.6, height: 0.6 },
    frames: [
      ["03-low.jpg", "Low"],
      ["07-low-2.jpg", "Low"],
      ["06-mostly-full.jpg", "Full"],
      ["05-full-again.jpg", "Full"],
    ],
  },
];

export const WHOLE_IMAGE = { x: 0, y: 0, width: 1, height: 1 };
export const hasSet = (s: RealSet) => existsSync(s.folder + s.reference);

const cache = new Map<string, RGB>();
async function load(path: string) {
  if (!cache.has(path)) cache.set(path, await decode(await readFile(path)));
  return cache.get(path)!;
}

export type Measured = {
  file: string;
  expected: Status;
  informational: boolean;
  outcome: string;
  status: string | null;
  coverage: number | null;
  level: number | null;
};

/** Calibrates exactly like shelf setup (reference + stocked), then measures every frame. */
export async function measureSet(
  set: RealSet,
  area: { x: number; y: number; width: number; height: number },
) {
  const roi = roiSchema.parse(area);
  const reference = await load(set.folder + set.reference);
  const stocked = await detect(
    reference,
    await load(set.folder + set.stocked),
    roi,
    settingsSchema.parse({}),
  );
  if (stocked.outcome !== "Valid" || stocked.occupancy_ratio === null)
    throw new Error(
      `${set.name}: stocked photo not valid (${stocked.warnings})`,
    );
  const full = stocked.occupancy_ratio;
  const settings = settingsSchema.parse({ ...scaleThresholds(full) });
  const rows: Measured[] = [];
  for (const [file, expected, info] of set.frames) {
    const r = await detect(
      reference,
      await load(set.folder + file),
      roi,
      settings,
    );
    rows.push({
      file,
      expected,
      informational: !!info,
      outcome: r.outcome,
      status: r.classification,
      coverage: r.occupancy_ratio,
      level: r.occupancy_ratio === null ? null : r.occupancy_ratio / full,
    });
  }
  return { full, rows };
}
