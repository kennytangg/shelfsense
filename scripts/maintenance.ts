import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pool, transaction, query, insert } from "../src/server/database";
import {
  calibrate,
  analyze,
  configurePlacement,
  getShelf,
  activeAlert,
  staffAction,
} from "../src/server/shelves";
import { decode } from "../src/server/shelf-analysis";
import { calibrationSchema, placementSchema } from "../src/server/validation";
import { cleanup } from "../src/server/storage";
import { fixtures } from "./fixtures";
type SeedScenario = {
  identifier: string;
  name: string;
  sample: "low" | "full" | "empty" | "misplaced" | null;
  placement?: boolean;
  rejectedPhoto?: boolean;
  reportedRestocked?: boolean;
};
const seedScenarios: SeedScenario[] = [
  { identifier: "DEMO-01", name: "Cereals 1", sample: "low" },
  { identifier: "DEMO-02", name: "Cereals 2", sample: "full" },
  { identifier: "DEMO-03", name: "Cereals 3", sample: "empty" },
  {
    identifier: "DEMO-04",
    name: "Cereals 4",
    sample: "misplaced",
    placement: true,
  },
  {
    identifier: "DEMO-05",
    name: "Cereals 5",
    sample: "full",
    placement: true,
  },
  {
    identifier: "DEMO-06",
    name: "Cereals 6",
    sample: "empty",
    placement: true,
  },
  {
    identifier: "DEMO-07",
    name: "Cereals 7",
    sample: "low",
    placement: true,
    rejectedPhoto: true,
  },
  {
    identifier: "DEMO-08",
    name: "Cereals 8",
    sample: "low",
    reportedRestocked: true,
  },
  { identifier: "DEMO-09", name: "Cereals 9", sample: null },
];
export async function initialize() {
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(762410)");
    const current = (
      await query("SELECT * FROM stores ORDER BY created_at,id", [], c)
    )[0];
    if ((await query("SELECT id FROM stores", [], c)).length > 1)
      throw Error(
        "Multiple stores found; shared store initialization is ambiguous.",
      );
    if (current) return current.id;
    const now = new Date();
    return (
      await insert(
        "stores",
        {
          id: randomUUID(),
          name: "ShelfSense store",
          location: "Shared store",
          demo: false,
          created_at: now,
          updated_at: now,
        },
        c,
      )
    ).id;
  });
}
export async function seed() {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), "shelfsense-seed-"));
  try {
    const manifest = await fixtures(fixtureDirectory);
    const storeId = await initialize();
    const e = manifest.shelves[0];
    const image = async (file: string) =>
      decode(await readFile(join(fixtureDirectory, file)));
    for (const scenario of seedScenarios) {
      const id = await transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(762410)");
        if (
          (
            await query(
              "SELECT id FROM shelves WHERE store_id=$1 AND identifier=$2",
              [storeId, scenario.identifier],
              c,
            )
          ).length
        )
          return null;
        const now = new Date();
        return (
          await insert(
            "shelves",
            {
              id: randomUUID(),
              store_id: storeId,
              identifier: scenario.identifier,
              name: scenario.name,
              location: e.location,
              category: "Groceries",
              demo: true,
              settings: {},
              placement_settings: {},
              calibration_version: 0,
              created_at: now,
              updated_at: now,
            },
            c,
          )
        ).id;
      });
      if (!id) {
        console.log(`Preserved ${scenario.identifier}: already exists.`);
        continue;
      }
      if (!scenario.sample) {
        console.log(`Seeded ${scenario.identifier}: ${scenario.name}.`);
        continue;
      }
      await calibrate(
        id,
        await image(e.reference),
        calibrationSchema.parse({ roi: e.roi }),
        true,
      );
      if (scenario.placement)
        await configurePlacement(
          id,
          await image(e.samples.full.file),
          placementSchema.parse({}),
          (await getShelf(id)).calibration_version,
          true,
        );
      await analyze(id, await image(e.samples[scenario.sample].file), {
        demo: true,
        saveEvidence: false,
      });
      if (scenario.rejectedPhoto)
        await analyze(id, await image(e.samples.mismatched.file), {
          demo: true,
          saveEvidence: false,
        });
      if (scenario.reportedRestocked)
        await staffAction((await activeAlert(id))!.id, "report_restocked");
      console.log(`Seeded ${scenario.identifier}: ${scenario.name}.`);
    }
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
}
export async function resetDemo() {
  const keys = await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(762410)");
    const keys: string[] = [];
    const shelves = await query(
      "SELECT * FROM shelves WHERE demo=true FOR UPDATE",
      [],
      c,
    );
    for (const s of shelves) {
      if (
        (
          await query(
            "SELECT id FROM image_assets WHERE shelf_id=$1 AND demo=false LIMIT 1",
            [s.id],
            c,
          )
        ).length
      ) {
        console.log(`Preserved ${s.identifier}: contains user-owned images.`);
        continue;
      }
      keys.push(
        ...(
          await query(
            "SELECT storage_key FROM image_assets WHERE shelf_id=$1",
            [s.id],
            c,
          )
        ).map((a) => a.storage_key),
      );
      await query(
        "UPDATE shelves SET reference_image_id=NULL,placement_reference_image_id=NULL,latest_valid_analysis_id=NULL WHERE id=$1",
        [s.id],
        c,
      );
      for (const table of [
        "ingestion_receipts",
        "alerts",
        "analyses",
        "image_assets",
      ])
        await query(`DELETE FROM ${table} WHERE shelf_id=$1`, [s.id], c);
      await query("DELETE FROM shelves WHERE id=$1", [s.id], c);
    }
    return keys;
  });
  await cleanup(keys);
}
if (process.argv[1]?.endsWith("maintenance.ts")) {
  const cmd = process.argv[2];
  const work =
    cmd === "initialize"
      ? initialize()
      : cmd === "seed"
        ? seed()
        : cmd === "reset-demo" && process.argv.includes("--yes")
          ? resetDemo()
          : Promise.reject(Error("Use initialize, seed or reset-demo --yes"));
  work
    .then(() => console.log("Maintenance complete; user-owned data preserved."))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool().end());
}
