import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { config } from "dotenv";
import { ENV } from "./support/state";

config({ path: ".env", quiet: true });

const LOG_DIR = "e2e/.artifacts";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function run(
  script: string,
  env: NodeJS.ProcessEnv,
  log: number,
  attempts = 1,
) {
  let result = spawnSync("npm", ["run", script], {
    env,
    stdio: ["ignore", log, log],
  });
  // Next.js can stop a build once to print an advisory (it says "retry the
  // same command"); a second attempt is a plain retry of the same build.
  for (let retry = 1; retry < attempts && result.status !== 0; retry++) {
    result = spawnSync("npm", ["run", script], {
      env,
      stdio: ["ignore", log, log],
    });
  }
  if (result.status !== 0) {
    throw new Error(`"npm run ${script}" failed; see ${LOG_DIR}/setup.log`);
  }
}

async function waitForHealth(
  url: string,
  server: ChildProcess,
  headers: Record<string, string> = {},
) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited early; see ${LOG_DIR}/*.log`);
    }
    try {
      if ((await fetch(`${url}/api/health`, { headers })).ok) return;
    } catch {
      // Not listening yet; poll again.
    }
    await sleep(200);
  }
  throw new Error(`Server at ${url} did not become ready`);
}

async function stop(server: ChildProcess | undefined) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise((done) => server.once("exit", done));
}

function startServer(port: number, env: NodeJS.ProcessEnv, log: number) {
  return spawn(
    "node",
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env, stdio: ["ignore", log, log] },
  );
}

/** Provision a disposable schema, temp media and built servers; returns the teardown. */
export default async function globalSetup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required (a disposable Postgres, never the app database).",
    );
  }
  const target = new URL(testUrl);
  if (target.protocol !== "postgresql:" && target.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL");
  }
  if (!LOOPBACK.has(target.hostname)) {
    throw new Error("The e2e database must be on localhost; refusing to run.");
  }
  if (process.env.DATABASE_URL) {
    const application = new URL(process.env.DATABASE_URL);
    if (application.pathname === target.pathname) {
      throw new Error(
        "TEST_DATABASE_URL must use a different database name than DATABASE_URL.",
      );
    }
  }

  await mkdir(LOG_DIR, { recursive: true });
  const schema = `e2e_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: target.toString() });
  const mediaRoot = await mkdtemp(join(tmpdir(), "shelfsense-e2e-"));
  const setupLog = openSync(`${LOG_DIR}/setup.log`, "a");
  const mainLog = openSync(`${LOG_DIR}/server.log`, "w");
  const gateLog = openSync(`${LOG_DIR}/gate-server.log`, "w");
  let main: ChildProcess | undefined;
  let gate: ChildProcess | undefined;

  const teardown = async () => {
    await stop(main);
    await stop(gate);
    for (const fd of [setupLog, mainLog, gateLog]) closeSync(fd);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await rm(mediaRoot, { recursive: true, force: true });
  };

  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    target.searchParams.set("options", `-csearch_path=${schema}`);
    const base: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: target.toString(),
      MEDIA_DIR: join(mediaRoot, "media"),
    };
    // Hosted-only variables must never leak in from a developer shell.
    delete base.VERCEL;
    delete base.BLOB_READ_WRITE_TOKEN;
    delete base.OPERATOR_USERNAME;
    delete base.OPERATOR_PASSWORD;

    if (process.env.E2E_SKIP_BUILD !== "1" || !existsSync(".next/BUILD_ID")) {
      run("build", base, setupLog, 2);
    }
    run("migrate", base, setupLog);
    run("initialize", base, setupLog);

    const [mainPort, gatePort] = [await freePort(), await freePort()];
    main = startServer(mainPort, base, mainLog);
    const operatorUser = `operator-${randomBytes(4).toString("hex")}`;
    const operatorPassword = randomBytes(18).toString("base64url");
    gate = startServer(
      gatePort,
      {
        ...base,
        VERCEL: "1",
        OPERATOR_USERNAME: operatorUser,
        OPERATOR_PASSWORD: operatorPassword,
      },
      gateLog,
    );
    const auth = `Basic ${Buffer.from(`${operatorUser}:${operatorPassword}`).toString("base64")}`;
    await Promise.all([
      waitForHealth(`http://127.0.0.1:${mainPort}`, main),
      waitForHealth(`http://127.0.0.1:${gatePort}`, gate, {
        Authorization: auth,
      }),
    ]);
    process.env[ENV.baseUrl] = `http://127.0.0.1:${mainPort}`;
    process.env[ENV.gateUrl] = `http://127.0.0.1:${gatePort}`;
    process.env[ENV.operatorUser] = operatorUser;
    process.env[ENV.operatorPassword] = operatorPassword;
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
