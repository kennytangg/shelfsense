import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { openSync, closeSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
import { config } from "dotenv";
import { chromium, expect } from "@playwright/test";
config({ path: ".env", quiet: true });
async function main() {
  if (!process.env.TEST_DATABASE_URL)
    throw Error("TEST_DATABASE_URL is required; browser verification skipped");
  const target = new URL(process.env.TEST_DATABASE_URL),
    application = new URL(process.env.DATABASE_URL!);
  if (
    target.pathname === application.pathname ||
    target.protocol !== "postgresql:"
  )
    throw Error("A separate PostgreSQL test database is required");
  const schema = "browser_" + randomUUID().replaceAll("-", ""),
    admin = new Pool({ connectionString: target.toString() }),
    dir = await mkdtemp(tmpdir() + "/shelfsense-browser-");
  await admin.query(`CREATE SCHEMA ${schema}`);
  target.searchParams.set("options", `-csearch_path=${schema}`);
  const env = {
      ...process.env,
      DATABASE_URL: target.toString(),
      MEDIA_DIR: dir + "/media",
    },
    log = openSync("/tmp/shelfsense-browser.log", "w");
  let server: ReturnType<typeof spawn> | undefined,
    browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    for (const script of ["migrate", "seed"]) {
      const r = spawnSync("npm", ["run", script], {
        env,
        stdio: ["ignore", log, log],
      });
      if (r.status !== 0)
        throw Error(`${script} failed; see /tmp/shelfsense-browser.log`);
    }
    const port = await new Promise<number>((done, reject) => {
      const probe = createServer();
      probe.on("error", reject);
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address();
        const p = typeof address === "object" && address ? address.port : 0;
        probe.close(() => done(p));
      });
    });
    const base = `http://127.0.0.1:${port}`;
    server = spawn(
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
    for (let n = 0; n < 150; n++) {
      try {
        if ((await fetch(base + "/api/health")).ok) break;
      } catch {}
      if (server.exitCode !== null)
        throw Error("Server exited; see browser log");
      await setTimeout(200);
      if (n === 149) throw Error("Server readiness timed out");
    }
    const executablePath =
      process.env.CHROMIUM_EXECUTABLE ||
      (existsSync("/tmp/shelfsense-browsers/chromium-1194/chrome-linux/chrome")
        ? "/tmp/shelfsense-browsers/chromium-1194/chrome-linux/chrome"
        : undefined);
    browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
      }),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const shelves = await (await fetch(base + "/api/shelves")).json(),
      shelf = shelves.find(
        (s: { identifier: string }) => s.identifier === "SH-01",
      ),
      id = shelf.id;
    await page.goto(base);
    await expect(page.locator(".shelf-card")).toHaveCount(12);
    await page.goto(`${base}/shelves/${id}`);
    await page.getByRole("button", { name: "Enable placement review" }).click();
    await page.getByRole("button", { name: "Use correct demo layout" }).click();
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(page.locator(".reading-panel .badge")).toHaveText(
      "Not checked",
    );
    async function sample(value: string, placement: string) {
      await page.getByLabel("Sample image").selectOption(value);
      await page
        .getByRole("button", { name: "Run demo sample", exact: true })
        .click();
      await expect(page.locator("#demo [role=status]")).toContainText(
        placement,
        { timeout: 30000 },
      );
      await expect(page.locator(".placement-panel .badge")).toHaveText(
        placement,
      );
    }
    await sample("low", "Matches reference");
    await expect(page.locator(".reading-panel .badge")).toHaveText("Low");
    await page
      .getByRole("button", { name: "Acknowledge", exact: true })
      .click();
    await expect(page.locator(".task-state"))
      .toContainText("Acknowledged")
      .catch(async () => {
        await expect(
          page.getByText("Acknowledged", { exact: true }).first(),
        ).toBeVisible();
      });
    await page
      .getByRole("button", { name: "Report restocked", exact: true })
      .click();
    await expect(
      page.getByText("Awaiting verification", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator(".reading-panel .badge")).toHaveText("Low");
    await sample("misplaced", "Placement review");
    await expect(page.locator(".reading-panel .badge")).toHaveText("Full");
    await page.getByLabel("Detection overlay").check();
    await page
      .getByText("Expected layout for this check", { exact: true })
      .click();
    await expect(
      page.getByAltText("Expected shelf layout for this analysis"),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/shelfsense-migration-desktop.png",
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator(".placement-panel .badge")).toHaveText(
      "Placement review",
    );
    await page.goto(base);
    await page
      .getByRole("button", { name: "Placement review", exact: false })
      .first()
      .click();
    await expect(page.locator(".shelf-card")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/shelves/${id}`);
    await expect(page.locator(".placement-panel .badge")).toHaveText(
      "Placement review",
    );
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw Error("Mobile overflow");
    await page.screenshot({
      path: "/tmp/shelfsense-migration-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Expected layout", exact: true })
      .click();
    await page
      .getByLabel("Shelf photo")
      .setInputFiles("assets/demo/zone-01/full.png");
    await page
      .getByRole("button", { name: "Save expected layout", exact: true })
      .click();
    await expect(page.locator("dialog")).toHaveCount(0);
    await sample("low", "Matches reference");
    await page
      .getByRole("button", { name: "Expected layout", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Disable placement review", exact: true })
      .click();
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Enable placement review" }),
    ).toBeVisible();
    // Real local uploader: stable-file checks, restart deduplication and source retention.
    const { FolderMonitor } = await import("./watch");
    const folder = dir + "/inbox";
    await mkdir(folder + "/SH-01", { recursive: true });
    const { writeFile, access } = await import("node:fs/promises");
    await writeFile(
      folder + "/SH-01/photo.png",
      await readFile("assets/demo/zone-01/low.png"),
    );
    const history = async () =>
        (await (await fetch(`${base}/api/shelves/${id}/analyses`)).json())
          .length,
      before = await history(),
      worker = new FolderMonitor(folder, base);
    await worker.scan();
    await worker.scan();
    if ((await history()) !== before + 1) throw Error("Watcher did not ingest");
    const restart = new FolderMonitor(folder, base);
    await restart.scan();
    await restart.scan();
    if ((await history()) !== before + 1)
      throw Error("Watcher duplicated ingestion");
    await access(folder + "/SH-01/photo.png");
    if (errors.length) throw Error(errors.join("; "));
    console.log(
      "PASS: production browser, placement, restocking, uploads, history, dashboard, mobile, and folder restart deduplication. Screenshots saved in /tmp.",
    );
  } finally {
    await browser?.close();
    if (server?.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((done) => server!.once("exit", done));
    }
    closeSync(log);
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
