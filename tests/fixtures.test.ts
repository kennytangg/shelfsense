import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fixtures } from "../scripts/fixtures";
import { decode, detect, comparePlacement } from "../src/server/detector";
import { settingsSchema, placementSchema } from "../src/server/validation";
test("fixture generation produces stock and placement samples", async () => {
  const dir = await mkdtemp(tmpdir() + "/shelfsense-fixtures-");
  try {
    const m = await fixtures(dir);
    assert.equal(m.shelves.length, 12);
    const e = m.shelves[0],
      settings = settingsSchema.parse({}),
      reference = await decode(await readFile(dir + "/" + e.reference)),
      expected = await decode(await readFile(dir + "/" + e.samples.full.file));
    for (const [name, status] of [
      ["empty", "Empty"],
      ["low", "Low"],
      ["full", "Full"],
      ["misplaced", "Full"],
      ["mismatched", null],
    ] as const) {
      const current = await decode(
          await readFile(dir + "/" + e.samples[name].file),
        ),
        result = await detect(reference, current, e.roi, settings);
      assert.equal(result.classification, status);
      if (name === "misplaced")
        assert.equal(
          (
            await comparePlacement(
              reference,
              expected,
              current,
              e.roi,
              settings,
              placementSchema.parse({}),
              result,
            )
          ).status,
          "Placement review",
        );
    }
    const before = await readFile(dir + "/zone-01/reference.png");
    await fixtures(dir);
    assert.deepEqual(await readFile(dir + "/zone-01/reference.png"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
