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
    for (const script of ["migrate", "initialize"]) {
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
    await page.goto(base);
    await expect(
      page.getByText("Add your first shelf", { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".simple-card")).toHaveCount(0);
    await page
      .getByRole("link", { name: "Add shelf", exact: true })
      .first()
      .click();
    await page.getByLabel("Shelf name").fill("Test cereal shelf");
    await page.getByLabel("Location", { exact: true }).fill("Aisle 1");
    await page.getByRole("button", { name: "Add shelf", exact: true }).click();
    await expect(page).toHaveURL(/\/setup$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    await page
      .getByLabel("Shelf photo")
      .setInputFiles("tests/fixtures/shelves/sh-01-reference.png");
    await page.getByRole("button", { name: "Use entire image" }).click();
    await page.locator(".roi-canvas").focus();
    // Match the frozen fixture's documented area with keyboard controls.
    for (let n = 0; n < 10; n++) await page.keyboard.press("Shift+ArrowLeft");
    for (let n = 0; n < 20; n++) await page.keyboard.press("Shift+ArrowUp");
    for (let n = 0; n < 5; n++) await page.keyboard.press("ArrowRight");
    for (let n = 0; n < 10; n++) await page.keyboard.press("ArrowDown");
    await page.getByRole("button", { name: "Save setup", exact: true }).click();
    await expect(page).toHaveURL(/\/check$/);
    async function check(name: string, status: string) {
      await page.goto(base + "/shelves/" + id + "/check");
      await page
        .getByLabel("Shelf photo")
        .setInputFiles("tests/fixtures/shelves/sh-01-" + name + ".png");
      await page
        .getByRole("button", { name: "Analyze photo", exact: true })
        .click();
      await expect(page).toHaveURL(base + "/shelves/" + id);
      await expect(page.locator(".result-card .badge")).toHaveText(status, {
        timeout: 30000,
      });
    }
    await check("low", "Low");
    await page.goto(base + "/shelves/" + id + "/check");
    await page
      .getByLabel("Shelf photo")
      .setInputFiles("tests/fixtures/shelves/mismatched.png");
    await page
      .getByRole("button", { name: "Analyze photo", exact: true })
      .click();
    await expect(page).toHaveURL(base + "/shelves/" + id);
    await expect(page.locator(".result-card .badge")).toHaveText("Low");
    await expect(
      page.getByText("Latest check failed:", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "I've restocked this shelf", exact: true })
      .click();
    await expect(
      page.getByText("Waiting for a new photo", { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".result-card .badge")).toHaveText("Low");
    await page.goto(base + "/alerts");
    await expect(page.locator(".shelf-list .simple-card")).toHaveCount(1);
    await check("full", "Full");
    await page.goto(base + "/alerts");
    await expect(
      page.getByText("No restocking needed.", { exact: true }),
    ).toBeVisible();
    await check("reference", "Empty");
    await page.goto(base);
    await page.getByLabel("Status", { exact: true }).selectOption("Empty");
    await page.getByRole("button", { name: "Apply filter" }).click();
    await expect(page).toHaveURL(base + "/?status=Empty");
    await page.reload();
    await expect(page.locator(".shelf-list .simple-card")).toHaveCount(1);
    await page.getByLabel("Status", { exact: true }).selectOption("Full");
    await page.getByRole("button", { name: "Apply filter" }).click();
    await expect(
      page.getByRole("link", { name: "Show all shelves" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
      "Empty",
    );
    await page.goForward();
    await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
      "Full",
    );
    await page.goto(base + "/shelves/" + id + "?setup=1");
    await expect(page).toHaveURL(/\/setup$/);
    await page.goto(base + "/help");
    await expect(
      page.getByRole("heading", { name: "Help", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/shelves/" + id);
    await expect(page.locator(".result-card .badge")).toHaveText("Empty");
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw Error("Mobile overflow");
    await check("low", "Low");
    const shelves = await (await fetch(base + "/api/shelves")).json();
    const identifier = shelves.find(
      (s: { id: string }) => s.id === id,
    ).identifier;
    // Real local uploader: stable-file checks, restart deduplication and source retention.
    const { FolderMonitor } = await import("./watch");
    const folder = dir + "/inbox";
    await mkdir(folder + "/" + identifier, { recursive: true });
    const { writeFile, access } = await import("node:fs/promises");
    await writeFile(
      folder + "/" + identifier + "/photo.png",
      await readFile("tests/fixtures/shelves/sh-01-low.png"),
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
    await access(folder + "/" + identifier + "/photo.png");
    if (errors.length) throw Error(errors.join("; "));
    console.log(
      "PASS: empty workspace, create/setup/check pages, real uploads, alerts and verification, URL filters, Back/Forward, keyboard area selection, mobile and folder restart deduplication.",
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
