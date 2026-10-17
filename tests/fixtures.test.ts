import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fixtures } from "../scripts/fixtures";
import { decode, detect, comparePlacement } from "../src/server/shelf-analysis";
import { settingsSchema, placementSchema } from "../src/server/validation";
test("demo fixtures include all stock, placement and rejected-photo inputs without duplicate images", async () => {
  const dir = await mkdtemp(tmpdir() + "/shelfsense-fixtures-");
  try {
    const m = await fixtures(dir);
    assert.equal(m.shelves.length, 1);
    assert.equal(
      (await readdir(dir)).filter((file) => file.endsWith(".png")).length,
      5,
    );
    for (const shelf of m.shelves) {
      assert.equal(shelf.samples.empty.file, shelf.reference);
      assert.deepEqual(Object.keys(shelf.samples).sort(), [
        "empty",
        "full",
        "low",
        "mismatched",
        "misplaced",
      ]);
    }
    const e = m.shelves[0],
      settings = settingsSchema.parse({}),
      reference = await decode(await readFile(dir + "/" + e.reference));
    const imageFiles = (await readdir(dir)).filter((file) =>
      file.endsWith(".png"),
    );
    const hashes = await Promise.all(
      imageFiles.map(async (file) =>
        createHash("sha256")
          .update(await readFile(dir + "/" + file))
          .digest("hex"),
      ),
    );
    assert.equal(new Set(hashes).size, imageFiles.length);
    const expected = await decode(
      await readFile(dir + "/" + e.samples.full.file),
    );
    const misplaced = await decode(
      await readFile(dir + "/" + e.samples.misplaced.file),
    );
    const stock = await detect(reference, misplaced, e.roi, settings);
    assert.equal(stock.classification, "Full");
    assert.equal(
      (
        await comparePlacement(
          reference,
          expected,
          misplaced,
          e.roi,
          settings,
          placementSchema.parse({}),
          stock,
        )
      ).status,
      "Placement review",
    );
    const mismatched = await detect(
      reference,
      await decode(await readFile(dir + "/" + e.samples.mismatched.file)),
      e.roi,
      settings,
    );
    assert.equal(mismatched.outcome, "Review required");
    assert.equal(mismatched.classification, null);
    for (const [name, status] of [
      ["empty", "Empty"],
      ["low", "Low"],
      ["full", "Full"],
    ] as const) {
      const current = await decode(
          await readFile(dir + "/" + e.samples[name].file),
        ),
        result = await detect(reference, current, e.roi, settings);
      assert.equal(result.classification, status);
    }
    const before = await readFile(dir + "/sh-01-reference.png");
    await fixtures(dir);
    assert.deepEqual(await readFile(dir + "/sh-01-reference.png"), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
