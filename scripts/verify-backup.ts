import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { pool, query } from "../src/server/database";
import { readImage } from "../src/server/storage";
async function main() {
  const dir = process.argv[2];
  if (!dir) throw Error("Pass the backup directory");
  const result = spawnSync(
    "pg_restore",
    [
      "--data-only",
      "--no-owner",
      "--no-privileges",
      "--file=-",
      resolve(dir, "database.dump"),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) throw Error("Cannot read backup");
  const domains = [
    "stores",
    "shelves",
    "image_assets",
    "analyses",
    "alerts",
    "ingestion_receipts",
  ];
  let count = 0;
  const unescape = (s: string) =>
    s.replace(
      /\\([\\ntbrfv])/g,
      (_, c: string) =>
        ({ n: "\n", t: "\t", b: "\b", r: "\r", f: "\f", v: "\v", "\\": "\\" })[
          c
        ]!,
    );
  for (const match of result.stdout.matchAll(
    /COPY public\.(\w+) \(([^)]+)\) FROM stdin;\n([\s\S]*?)\\\.\n/g,
  )) {
    const [, table, columnText, data] = match;
    if (!domains.includes(table)) continue;
    const columns = columnText.split(", "),
      rows = data.trimEnd()
        ? data
            .trimEnd()
            .split("\n")
            .map((line) => line.split("\t"))
        : [];
    const current = await query(`SELECT * FROM ${table}`);
    assert.equal(current.length, rows.length, `${table} count changed`);
    for (const values of rows) {
      const record = current.find((row) =>
        columns
          .filter((c) =>
            ["id", "shelf_id", "calibration_version", "digest"].includes(c),
          )
          .every((c) => String(row[c]) === values[columns.indexOf(c)]),
      );
      assert.ok(record, `${table} row missing`);
      for (const [i, column] of columns.entries()) {
        const original = values[i],
          value: unknown = record[column];
        if (original === "\\N") {
          assert.equal(value, null);
          continue;
        }
        const text = unescape(original);
        if (value instanceof Date)
          assert.equal(value.getTime(), Date.parse(text));
        else if (typeof value === "object")
          assert.deepEqual(value, JSON.parse(text));
        else if (typeof value === "boolean") assert.equal(value, text === "t");
        else if (typeof value === "number") assert.equal(value, Number(text));
        else assert.equal(value, text);
      }
      count++;
    }
  }
  const assets = await query("SELECT * FROM image_assets");
  for (const a of assets) {
    const original = spawnSync(
      "tar",
      ["-xOzf", resolve(dir, "media.tar.gz"), `./${a.storage_key}`],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    if (original.status !== 0) throw Error(`Missing backup asset ${a.id}`);
    const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    assert.equal(hash(await readImage(a.storage_key)), hash(original.stdout));
  }
  console.log(
    `Backup verified: ${count} unchanged domain rows and ${assets.length} identical media SHA-256 hashes.`,
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
