import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { decode, detect } from "../src/server/shelf-analysis";
import { settingsSchema, roiSchema } from "../src/server/validation";
async function main() {
  const start = performance.now(),
    roi = roiSchema.parse({}),
    settings = settingsSchema.parse({});
  const ref = await readFile("tests/fixtures/shelves/sh-01-reference.png"),
    full = await readFile("tests/fixtures/shelves/sh-01-full.png");
  const huge = async (bytes: Buffer) =>
    decode(
      await sharp(bytes)
        .resize(5000, 4000, { fit: "fill" })
        .jpeg({ quality: 85 })
        .toBuffer(),
    );
  const result = await detect(await huge(ref), await huge(full), roi, settings);
  if (result.outcome !== "Valid")
    throw Error("20MP detection failed: " + result.warnings.join("; "));
  const narrow = await decode(
      await sharp(ref).resize(256, 1024, { fit: "fill" }).png().toBuffer(),
    ),
    narrowFull = await decode(
      await sharp(full).resize(256, 1024, { fit: "fill" }).png().toBuffer(),
    );
  const boundary = await detect(
    narrow,
    narrowFull,
    roi,
    settingsSchema.parse({ processing_width: 1024 }),
  );
  if (boundary.outcome !== "Valid")
    throw Error(
      "Maximum processing-height detection failed: " +
        boundary.warnings.join("; "),
    );
  console.log(
    JSON.stringify({
      decodedPixelLimit: 20000000,
      processingPixelLimit: 1024 * 4096,
      durationMs: performance.now() - start,
      peakRssMiB: process.resourceUsage().maxRSS / 1024,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
