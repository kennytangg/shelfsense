import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  decode,
  detect,
  classify,
  comparePlacement,
  MAX_BYTES,
} from "../src/server/detector";
import {
  roiSchema,
  settingsSchema,
  placementSchema,
} from "../src/server/validation";
const settings = settingsSchema.parse({}),
  roi = roiSchema.parse({});
test("threshold equality and validation", () => {
  for (const [ratio, status] of [
    [0, "Empty"],
    [0.149999, "Empty"],
    [0.15, "Low"],
    [0.599999, "Low"],
    [0.6, "Full"],
    [1, "Full"],
  ] as const)
    assert.equal(classify(ratio, settings), status);
  assert.throws(() =>
    settingsSchema.parse({ empty_threshold: 0.8, full_threshold: 0.6 }),
  );
  assert.throws(() => settingsSchema.parse({ morphology_size: 2 }));
  assert.throws(() => roiSchema.parse({ x: 0.5, width: 0.8 }));
  assert.throws(() => placementSchema.parse({ mismatch_threshold: 0 }));
});
test("byte, format, dimensions and EXIF decoding", async () => {
  await assert.rejects(decode(Buffer.from("bad")));
  await assert.rejects(decode(Buffer.alloc(MAX_BYTES + 1)), { status: 413 });
  for (const [width, height, format] of [
    [20, 20, "png"],
    [64, 64, "gif"],
    [5000, 4100, "png"],
  ] as const) {
    const data = await sharp({
      create: { width, height, channels: 3, background: "green" },
    })
      .toFormat(format)
      .toBuffer();
    await assert.rejects(decode(data), { status: 422 });
  }
  const jpeg = await sharp({
    create: { width: 100, height: 70, channels: 3, background: "green" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const oriented = await decode(jpeg);
  assert.equal(oriented.width, 70);
  assert.equal(oriented.height, 100);
});
test("trusted managed PNGs retain pixel limits while allowing JPEG normalization growth", async () => {
  const data = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  const expanded = Buffer.concat([data, Buffer.alloc(MAX_BYTES)]);
  await assert.rejects(decode(expanded), { status: 413 });
  assert.equal((await decode(expanded, true)).width, 80);
});

test("quality guards retain null measurements", async () => {
  const reference = await decode(
    await readFile("assets/demo/zone-01/reference.png"),
  );
  for (const value of [0, 120, 255]) {
    const current = {
      data: Buffer.alloc(reference.data.length, value),
      width: reference.width,
      height: reference.height,
    };
    const result = await detect(reference, current, roi, settings);
    assert.equal(result.outcome, "Review required");
    assert.equal(result.classification, null);
  }
});
test("all 60 stock and placement results match expected detector outputs", async () => {
  const manifest = JSON.parse(
      await readFile("assets/demo/manifest.json", "utf8"),
    ),
    baseline = JSON.parse(
      await readFile("tests/fixtures/detector-expected.json", "utf8"),
    );
  for (const e of manifest.shelves) {
    const reference = await decode(
        await readFile("assets/demo/" + e.reference),
      ),
      expected = await decode(
        await readFile("assets/demo/" + e.samples.full.file),
      );
    for (const [name, sample] of Object.entries(e.samples) as [
      string,
      { file: string },
    ][]) {
      const current = await decode(
          await readFile("assets/demo/" + sample.file),
        ),
        stock = await detect(reference, current, e.roi, settings),
        p = await comparePlacement(
          reference,
          expected,
          current,
          e.roi,
          settings,
          placementSchema.parse({}),
          stock,
        ),
        py = baseline.find(
          (b: { identifier: string; sample: string }) =>
            b.identifier === e.identifier && b.sample === name,
        );
      assert.equal(stock.outcome, py.outcome);
      assert.equal(stock.classification, py.classification);
      assert.equal(stock.occupancy_ratio, py.occupancy_ratio);
      assert.equal(p.status, py.placement.status);
      assert.equal(p.mismatch_ratio, py.placement.mismatch_ratio);
      assert.equal(p.compared_ratio, py.placement.compared_ratio);
      if (stock.mask)
        assert.equal(
          stock.mask.data.filter((v) => v !== 0).length /
            stock.mask.data.length,
          stock.occupancy_ratio,
        );
    }
  }
});
