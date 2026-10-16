import { mkdir, readFile, writeFile, access, copyFile } from "node:fs/promises";

export async function fixtures(root = "tests/fixtures/shelves") {
  try {
    const manifest = JSON.parse(
      await readFile(`${root}/manifest.json`, "utf8"),
    );
    for (const shelf of manifest.shelves) {
      await access(`${root}/${shelf.reference}`);
      for (const sample of Object.values(shelf.samples) as { file: string }[])
        await access(`${root}/${sample.file}`);
    }
    return manifest;
  } catch {}
  const source = new URL("../tests/fixtures/shelves/", import.meta.url);
  const baseline = JSON.parse(
    await readFile(new URL("manifest.json", source), "utf8"),
  ).shelves[0];
  const { empty, low, full } = baseline.samples;
  const shelf = { ...baseline, samples: { empty, low, full } };
  const manifest = {
    description: "One synthetic sample shelf; original generated artwork, CC0.",
    shelves: [shelf],
  };
  await mkdir(root, { recursive: true });
  for (const file of new Set([shelf.reference, low.file, full.file]))
    await copyFile(new URL(file as string, source), `${root}/${file}`);
  await writeFile(
    `${root}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}
if (process.argv[1]?.endsWith("fixtures.ts"))
  fixtures().then(() => console.log("Demo fixtures ready."));
