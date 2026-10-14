import "server-only";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import { resolve } from "node:path";
// Hosted environments supply DATABASE_URL directly.
if (!process.env.VERCEL)
  config({ path: resolve(process.cwd(), ".env"), quiet: true });
const globalDb = globalThis as unknown as { shelfPool?: Pool };
export function pool() {
  if (!globalDb.shelfPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    globalDb.shelfPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
  }
  return globalDb.shelfPool;
}
export type Row = Record<string, any>;
export type Connection = PoolClient;
/** Parameterized Drizzle SQL, also used on the locked transaction connection. */
export async function query(
  text: string,
  values: unknown[] = [],
  connection?: Connection,
): Promise<Row[]> {
  const parts = text.split(/\$(\d+)/g);
  const chunks = parts.map((part, i) =>
    i % 2 ? sql`${values[Number(part) - 1]}` : sql.raw(part),
  );
  const result = await drizzle(connection ?? pool()).execute(
    sql.join(chunks, sql.raw("")),
  );
  return result.rows as Row[];
}
export async function transaction<T>(
  work: (c: Connection) => Promise<T>,
): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const result = await work(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const tables = new Set([
  "stores",
  "shelves",
  "image_assets",
  "analyses",
  "alerts",
  "ingestion_receipts",
]);
export async function insert(table: string, data: Row, c?: Connection) {
  if (!tables.has(table) || Object.keys(data).some((k) => !/^\w+$/.test(k)))
    throw new Error("Invalid SQL identifier");
  const keys = Object.keys(data);
  return (
    await query(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
      keys.map((k) =>
        data[k] !== null &&
        typeof data[k] === "object" &&
        !(data[k] instanceof Date)
          ? JSON.stringify(data[k])
          : data[k],
      ),
      c,
    )
  )[0];
}
export async function update(
  table: string,
  id: string,
  data: Row,
  c?: Connection,
) {
  if (!tables.has(table) || Object.keys(data).some((k) => !/^\w+$/.test(k)))
    throw new Error("Invalid SQL identifier");
  const keys = Object.keys(data);
  await query(
    `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${keys.length + 1}`,
    [
      ...keys.map((k) =>
        data[k] !== null &&
        typeof data[k] === "object" &&
        !(data[k] instanceof Date)
          ? JSON.stringify(data[k])
          : data[k],
      ),
      id,
    ],
    c,
  );
}
