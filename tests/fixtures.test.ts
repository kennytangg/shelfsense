import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fixtures } from "../scripts/fixtures";
import { decode, detect } from "../src/server/shelf-analysis";
import { settingsSchema } from "../src/server/validation";
test("minimal demo covers all stock states with three images", async () => {
  const dir = await mkdtemp(tmpdir() + "/shelfsense-fixtures-");
  try {
    const m = await fixtures(dir);
    assert.equal(m.shelves.length, 1);
    assert.equal(
      (await readdir(dir)).filter((file) => file.endsWith(".png")).length,
      3,
    );
    for (const shelf of m.shelves) {
      assert.equal(shelf.samples.empty.file, shelf.reference);
      assert.deepEqual(Object.keys(shelf.samples).sort(), [
        "empty",
        "full",
        "low",
      ]);
    }
    const e = m.shelves[0],
      settings = settingsSchema.parse({}),
      reference = await decode(await readFile(dir + "/" + e.reference));
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
