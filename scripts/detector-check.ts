import { readFile } from "node:fs/promises";
import { decode, detect, comparePlacement } from "../src/server/detector";
import { settingsSchema, placementSchema } from "../src/server/validation";
async function main() {
  const root = "assets/demo/";
  const manifest = JSON.parse(await readFile(root + "manifest.json", "utf8"));
  const baseline = JSON.parse(
    await readFile("tests/fixtures/detector-expected.json", "utf8"),
  );
  let maxDifference = 0;
  const start = performance.now();
  for (const entry of manifest.shelves) {
    const ref = await decode(await readFile(root + entry.reference)),
      expected = await decode(await readFile(root + entry.samples.full.file));
    for (const [name, sample] of Object.entries(entry.samples) as [
      string,
      { file: string },
    ][]) {
      const current = await decode(await readFile(root + sample.file)),
        stock = await detect(ref, current, entry.roi, settingsSchema.parse({})),
        placement = await comparePlacement(
          ref,
          expected,
          current,
          entry.roi,
          settingsSchema.parse({}),
          placementSchema.parse({}),
          stock,
        );
      const py = baseline.find(
        (b: { identifier: string; sample: string }) =>
          b.identifier === entry.identifier && b.sample === name,
      );
      if (
        stock.classification !== py.classification ||
        stock.outcome !== py.outcome ||
        placement.status !== py.placement.status
      )
        throw Error(
          JSON.stringify({
            shelf: entry.identifier,
            name,
            stock,
            placement,
            py,
          }),
        );
      maxDifference = Math.max(
        maxDifference,
        Math.abs((stock.occupancy_ratio ?? 0) - (py.occupancy_ratio ?? 0)),
      );
    }
  }
  console.log(
    JSON.stringify({
      cases: baseline.length,
      maxDifference,
      durationMs: performance.now() - start,
      rssMiB: process.memoryUsage().rss / 1024 / 1024,
    }),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
