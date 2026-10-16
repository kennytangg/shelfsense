import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool, transaction } from "../src/server/database";
export async function migrate() {
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(762411)");
    await c.query(
      "CREATE TABLE IF NOT EXISTS shelfsense_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const journal = await c.query("SELECT * FROM shelfsense_migrations");
    const hasSchema = (await c.query("SELECT to_regclass('stores') AS name"))
      .rows[0].name;
    if (hasSchema && journal.rowCount === 0)
      throw Error(
        "Existing schema has no migration history; use a fresh database.",
      );
    const versions = ["0001", "0002"];
    if (journal.rows.some((row) => !versions.includes(row.version)))
      throw Error("Unsupported migration history; use a fresh database.");
    if (
      journal.rows.some((row) => row.version === "0002") &&
      !journal.rows.some((row) => row.version === "0001")
    )
      throw Error("Unsupported migration history; use a fresh database.");
    for (const version of versions) {
      const text = await readFile(`migrations/${version}.sql`, "utf8"),
        checksum = createHash("sha256").update(text).digest("hex");
      const applied = journal.rows.find((r) => r.version === version);
      if (applied) {
        if (applied.checksum !== checksum)
          throw Error(`Applied migration ${version} changed`);
        continue;
      }
      await c.query(text);
      await c.query(
        "INSERT INTO shelfsense_migrations(version,checksum) VALUES($1,$2)",
        [version, checksum],
      );
    }
    const constraints = (
      await c.query(
        "SELECT conname FROM pg_constraint WHERE connamespace=current_schema()::regnamespace",
      )
    ).rows.map((r) => r.conname);
    for (const name of [
      "shelf_reference_ownership",
      "shelf_analysis_ownership",
      "shelf_placement_ownership",
      "analysis_placement_ownership",
      "ingestion_receipts_pkey",
      "image_assets_role_check",
    ])
      if (!constraints.includes(name))
        throw Error(
          `Schema missing required constraint ${name}; migration rolled back`,
        );
    const indexes = (
      await c.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname=current_schema()",
      )
    ).rows.map((r) => r.indexname);
    for (const name of [
      "one_demo_store",
      "one_active_alert_per_shelf",
      "recent_analyses",
      "recent_alerts",
      "shelf_images",
    ])
      if (!indexes.includes(name))
        throw Error(`Schema missing required index ${name}`);
  });
}
if (process.argv[1]?.endsWith("migrate.ts"))
  migrate()
    .then(() =>
      console.log("SQL migrations complete; existing records preserved."),
    )
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool().end());
