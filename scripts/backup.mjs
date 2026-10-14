import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const url = new URL(process.env.DATABASE_URL);
const dir = resolve(process.argv[2] ?? `/tmp/shelfsense-backup-${Date.now()}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: url.pathname.slice(1),
};
for (const [cmd, args] of [
  ["pg_dump", ["--format=custom", "--file", resolve(dir, "database.dump")]],
  [
    "tar",
    [
      "-czf",
      resolve(dir, "media.tar.gz"),
      "-C",
      resolve(process.env.MEDIA_DIR || "media"),
      ".",
    ],
  ],
]) {
  const r = spawnSync(cmd, args, { env, stdio: "inherit" });
  if (r.status !== 0) throw Error(`${cmd} failed`);
}
writeFileSync(
  resolve(dir, "README.txt"),
  "Database and media snapshot. Restore together; keep credentials private.\n",
  { mode: 0o600 },
);
console.log(`Backup saved in ${dir}`);
