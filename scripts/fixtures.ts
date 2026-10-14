import sharp from "sharp";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
const names = [
  "Breakfast cereals",
  "Oat & nut bars",
  "Granola",
  "Pasta",
  "Rice & grains",
  "Cooking sauces",
  "Fruit juice",
  "Sparkling water",
  "Iced tea",
  "Crackers",
  "Trail mix",
  "Biscuits",
];
const aisles = ["01 · Breakfast", "02 · Pantry", "03 · Drinks", "04 · Snacks"];
export async function fixtures(root = "tests/fixtures/shelves") {
  // Retain the original CC0 fixtures when present; generation only fills missing sets.
  try {
    const m = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
    await Promise.all(
      m.shelves
        .flatMap(
          (e: {
            reference: string;
            samples: Record<string, { file: string }>;
          }) => [e.reference, ...Object.values(e.samples).map((s) => s.file)],
        )
        .map((f: string) => access(`${root}/${f}`)),
    );
    return m;
  } catch {}
  const manifest = {
    description: "Synthetic demo images; original generated artwork, CC0.",
    shelves: [] as Record<string, unknown>[],
  };
  for (let index = 0; index < 12; index++) {
    const prefix = `sh-${String(index + 1).padStart(2, "0")}`;
    await mkdir(root, { recursive: true });
    let state = 2026 + index;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    const base = Buffer.alloc(640 * 400 * 3);
    for (let p = 0; p < 640 * 400; p++) {
      const noise = (random() % 7) - 3;
      for (let c = 0; c < 3; c++) base[p * 3 + c] = [217, 219, 214][c] + noise;
    }
    const bands = [38, 193, 350]
      .map(
        (y) =>
          `<rect x="20" y="${y}" width="601" height="13" fill="#9baca6"/><rect x="20" y="${y}" width="601" height="2" fill="#657e74"/>`,
      )
      .join("");
    const svg = (shapes: string) =>
      Buffer.from(`<svg width="640" height="400">${bands}${shapes}</svg>`);
    const reference = await sharp(base, {
      raw: { width: 640, height: 400, channels: 3 },
    })
      .composite([{ input: svg("") }])
      .png()
      .toBuffer();
    await writeFile(`${root}/${prefix}-reference.png`, reference);
    const samples: Record<string, Record<string, string>> = {};
    let full = "";
    for (const [variant, num] of [
      ["empty", 0],
      ["low", 8],
      ["full", 18],
    ] as const) {
      let shapes = "";
      for (let n = 0; n < num; n++) {
        const x = 36 + (n % 9) * 63,
          y = 55 + Math.floor(n / 9) * 156,
          color = ["#368b86", "#d29445", "#bd6a56", "#769b54", "#637d9b"][
            (n + index) % 5
          ];
        shapes += `<rect x="${x}" y="${y}" width="60" height="136" rx="${(n + index) % 3 === 0 ? 12 : 0}" fill="${color}"/><rect x="${x + 6}" y="${y + 42}" width="46" height="39" fill="#f0ce86"/><text x="${x + 10}" y="${y + 65}" font-size="12" fill="#405a52">${["OATS", "FRESH", "DAILY"][index % 3]}</text>`;
      }
      if (variant !== "empty")
        await sharp(reference)
          .composite([{ input: svg(shapes) }])
          .png()
          .toFile(`${root}/${prefix}-${variant}.png`);
      samples[variant] = {
        file:
          variant === "empty"
            ? `${prefix}-reference.png`
            : `${prefix}-${variant}.png`,
        expected: variant[0].toUpperCase() + variant.slice(1),
      };
      if (variant === "full") full = shapes;
    }
    const changed = Array.from(
      { length: 9 },
      (_, col) =>
        `<rect x="${39 + col * 63}" y="63" width="53" height="123" fill="#a020ce"/>`,
    ).join("");
    await sharp(reference)
      .composite([{ input: svg(full + changed) }])
      .png()
      .toFile(`${root}/${prefix}-misplaced.png`);
    samples.misplaced = {
      file: `${prefix}-misplaced.png`,
      expected: "Full",
      expected_placement: "Placement review",
    };
    if (index === 0)
      await sharp({
        create: { width: 400, height: 640, channels: 3, background: "#222222" },
      })
        .png()
        .toFile(`${root}/mismatched.png`);
    samples.mismatched = {
      file: `mismatched.png`,
      expected: "Review required",
    };
    manifest.shelves.push({
      identifier: `SH-${String(index + 1).padStart(2, "0")}`,
      name: names[index],
      location: aisles[Math.floor(index / 3)],
      reference: `${prefix}-reference.png`,
      roi: { x: 0.05, y: 0.1, width: 0.9, height: 0.8 },
      samples,
    });
  }
  await writeFile(
    `${root}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}
if (process.argv[1]?.endsWith("fixtures.ts"))
  fixtures().then(() => console.log("Demo fixtures ready."));
