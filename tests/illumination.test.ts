import { test } from "node:test";
import assert from "node:assert/strict";
import { blockGains, normalizeIllumination } from "../src/server/illumination";
import type { RGB } from "../src/server/shelf-analysis";

const SIZE = 400;
/** Textured grey image so every block has varied pixels. */
function scene(gainAt: (x: number, y: number) => number): RGB {
  const data = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const base = 90 + ((x * 7 + y * 13) % 60);
      for (let c = 0; c < 3; c++)
        data[(y * SIZE + x) * 3 + c] = Math.min(
          255,
          Math.round(base * gainAt(x, y)),
        );
    }
  return { data, width: SIZE, height: SIZE };
}

test("identical frames give unit gains and an unchanged image", () => {
  const a = scene(() => 1);
  assert.ok(blockGains(a, a).every((g) => g === 1));
  assert.deepEqual(normalizeIllumination(a, a).data, a.data);
});
test("uneven brightness is divided out locally", () => {
  const ref = scene(() => 1);
  const cur = scene((x) => (x < SIZE / 2 ? 1.4 : 0.8));
  const fixed = normalizeIllumination(ref, cur);
  let worst = 0;
  // Skip the seam between the two lighting zones, where gains are interpolated.
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (Math.abs(x - SIZE / 2) < 60) continue;
      const i = (y * SIZE + x) * 3;
      worst = Math.max(worst, Math.abs(fixed.data[i] - ref.data[i]));
    }
  assert.ok(worst < 16, `max error ${worst}`);
});
test("a small stock patch is not normalised away, with or without a lighting change", () => {
  const ref = scene(() => 1);
  const cur = scene((x, y) => (x < 20 && y < 20 ? 0.3 : 1));
  // No lighting change: the image is returned untouched.
  assert.deepEqual(normalizeIllumination(ref, cur).data, cur.data);
  const lit = scene((x, y) => (x < 20 && y < 20 ? 0.3 : 1.3));
  const fixedLit = normalizeIllumination(ref, lit);
  assert.ok(
    ref.data[(5 * SIZE + 5) * 3] - fixedLit.data[(5 * SIZE + 5) * 3] > 40,
  );
});
