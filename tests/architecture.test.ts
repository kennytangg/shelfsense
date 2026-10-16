import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

test("demo manifest uses every bundled image without duplicate bytes", async () => {
  const root = "tests/fixtures/shelves/";
  const manifest = JSON.parse(await readFile(root + "manifest.json", "utf8"));
  const referenced = new Set<string>();
  for (const shelf of manifest.shelves) {
    referenced.add(shelf.reference);
    for (const sample of Object.values(shelf.samples) as { file: string }[]) {
      referenced.add(sample.file);
    }
  }
  const files = (await readdir(root)).filter((file) => file.endsWith(".png"));
  assert.deepEqual([...referenced].sort(), files.sort());
  const hashes = new Set<string>();
  for (const file of files) {
    const hash = createHash("sha256")
      .update(await readFile(root + file))
      .digest("hex");
    assert.equal(hashes.has(hash), false, `Duplicate demo image: ${file}`);
    hashes.add(hash);
  }
});

test("application dependencies preserve browser and analysis boundaries", async () => {
  for (const directory of ["src/components", "src/server"]) {
    for (const file of await readdir(directory, { recursive: true })) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = await readFile(`${directory}/${file}`, "utf8");
      const imports = [
        ...source.matchAll(/(?:from\s*|import\s*\()(["'])([^"']+)\1/g),
      ].map((match) => match[2]);
      for (const dependency of imports) {
        assert.doesNotMatch(dependency, /(?:^|\/)scripts\/|(?:^|\/)tests\//);
        if (directory === "src/components") {
          assert.doesNotMatch(
            dependency,
            /(?:^|\/)server\/|^(?:pg|drizzle-orm|sharp|@techstark\/opencv-js)(?:\/|$)/,
          );
        }
        if (file === "shelf-analysis.ts") {
          assert.doesNotMatch(
            dependency,
            /database|storage|shelves|http|components/,
          );
        }
      }
    }
  }
});
