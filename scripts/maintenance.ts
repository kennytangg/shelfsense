import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pool, transaction, query, insert } from "../src/server/db";
import { calibrate, analyze } from "../src/server/service";
import { decode } from "../src/server/detector";
import { calibrationSchema } from "../src/server/validation";
import { cleanup } from "../src/server/storage";
import { fixtures } from "./fixtures";
export async function seed() {
  const manifest = await fixtures();
  const storeId = await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(762410)");
    const current = (
      await query("SELECT * FROM stores WHERE demo=true", [], c)
    )[0];
    if (current) return current.id;
    const now = new Date();
    return (
      await insert(
        "stores",
        {
          id: randomUUID(),
          name: "Greenway Market",
          location: "University demo store",
          demo: true,
          created_at: now,
          updated_at: now,
        },
        c,
      )
    ).id;
  });
  for (const [index, e] of manifest.shelves.entries()) {
    const id = await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(762410)");
      if (
        (
          await query(
            "SELECT id FROM shelves WHERE store_id=$1 AND identifier=$2",
            [storeId, e.identifier],
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
            identifier: e.identifier,
            name: e.name,
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
    if (!id) continue;
    await calibrate(
      id,
      await decode(await readFile(`assets/demo/${e.reference}`)),
      calibrationSchema.parse({ roi: e.roi }),
      true,
    );
    const variants =
      index === 0
        ? ["full", "low", "empty", "full"]
        : [["full", "low", "empty"][index % 3]];
    for (const [step, variant] of variants.entries())
      await analyze(
        id,
        await decode(await readFile(`assets/demo/${e.samples[variant].file}`)),
        {
          demo: true,
          timestamp: new Date(
            Date.now() - 20 * 60000 * (variants.length - step),
          ),
        },
      );
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
    cmd === "seed"
      ? seed()
      : cmd === "reset-demo" && process.argv.includes("--yes")
        ? resetDemo()
        : Promise.reject(Error("Use seed or reset-demo --yes"));
  work
    .then(() => console.log("Maintenance complete; user-owned data preserved."))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool().end());
}
