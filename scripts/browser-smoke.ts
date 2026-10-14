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
    await expect(page.locator(".step-strip")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save setup", exact: true }),
    ).toBeDisabled();
    const cancel = page.getByRole("link", { name: "Cancel", exact: true });
    expect((await cancel.boundingBox())!.y).toBeLessThan(300);
    await cancel.click();
    await expect(page).toHaveURL(base + "/");
    await page.goto(base + "/shelves/" + id + "/setup");
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
    await page
      .getByRole("link", { name: "Back to shelves", exact: false })
      .click();
    await expect(page).toHaveURL(base + "/");
    await page.goto(base + "/shelves/" + id + "/check");
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(base + "/");
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

    // Exercise actual production CSS with several cards without changing stored shelves.
    const layoutPage = await browser.newPage();
    const shelf = await (await fetch(`${base}/api/shelves/${id}`)).json();
    const layoutShelves = Array.from({ length: 6 }, (_, index) => ({
      ...shelf,
      id: `${id}-layout-${index}`,
      name:
        index === 0
          ? "Breakfast cereals and pantry essentials on the upper shelf"
          : `Shelf ${index + 1}`,
      location:
        index === 0
          ? "Aisle 1 · Front of store · Upper shelves"
          : `Aisle ${index + 1}`,
      awaiting_verification: index === 1,
      last_error:
        index === 2
          ? "Image framing has an incompatible aspect ratio. Retake from the reference position."
          : null,
    }));
    await layoutPage.route(/\/api\/shelves$/, (route) =>
      route.fulfill({ json: layoutShelves }),
    );
    async function verifyTypographyAndReadingWidth() {
      expect(
        await layoutPage.evaluate(async () => {
          const faces = await document.fonts.load('20px "Bitstream Charter"');
          return (
            faces.length > 0 && faces.every((face) => face.status === "loaded")
          );
        }),
      ).toBe(true);
      await expect(layoutPage.locator("body")).toHaveCSS(
        "font-family",
        /sans-serif/,
      );
      for (const element of await layoutPage
        .locator("nav a, button, input, select, .card-location, figcaption")
        .all()) {
        await expect(element).toHaveCSS("font-family", /sans-serif/);
      }
      for (const badge of await layoutPage.locator(".badge").all()) {
        await expect(badge).toHaveCSS("font-family", /sans-serif/);
      }
      const sizes = await layoutPage.evaluate(() => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        const sizes = new Set<string>();
        while (walker.nextNode()) {
          const parent = walker.currentNode.parentElement;
          if (!walker.currentNode.textContent?.trim() || !parent) continue;
          const rect = parent.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          sizes.add(getComputedStyle(parent).fontSize);
        }
        return [...sizes].sort();
      });
      expect(sizes).toEqual(["16px", "20px", "32px"]);
      const reading = await layoutPage
        .locator(".reading-container, main.collection-page")
        .first()
        .boundingBox();
      expect(reading).not.toBeNull();
      expect(reading!.width).toBeLessThanOrEqual(1100);
      const viewport = layoutPage.viewportSize()!;
      expect(
        Math.abs(reading!.x * 2 + reading!.width - viewport.width),
      ).toBeLessThan(2);
      expect(
        await layoutPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    for (const [width, columns] of [
      [1440, 2],
      [1024, 2],
      [768, 2],
      [640, 2],
      [639, 1],
      [390, 1],
      [320, 1],
    ]) {
      await layoutPage.setViewportSize({ width, height: 1100 });
      for (const path of ["/", "/alerts"]) {
        await layoutPage.goto(base + path);
        const cards = layoutPage.locator(".shelf-list > .simple-card");
        await expect(cards).toHaveCount(6);
        const boxes = await cards.evaluateAll((cards) =>
          cards.map((card) => {
            const { x, y, width } = card.getBoundingClientRect();
            return { x, y, width };
          }),
        );
        expect(
          boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 2),
        ).toHaveLength(columns);
        expect(boxes[columns].y).toBeGreaterThan(boxes[0].y);
        if (columns > 1) expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
        await verifyTypographyAndReadingWidth();
        if (path === "/alerts") {
          await expect(layoutPage.locator(".alert-evidence")).toHaveCount(6);
          await expect(
            layoutPage.locator(".alert-evidence img").first(),
          ).toHaveCSS("object-fit", "contain");
        }
        if ([1440, 768, 390].includes(width)) {
          for (const photo of await layoutPage
            .locator(".alert-evidence img")
            .all()) {
            await photo.scrollIntoViewIfNeeded();
            await expect
              .poll(() =>
                photo.evaluate(
                  (image: HTMLImageElement) =>
                    image.complete && image.naturalWidth > 0,
                ),
              )
              .toBe(true);
          }
          await layoutPage.evaluate(() => window.scrollTo(0, 0));
          await layoutPage.screenshot({
            path: `/tmp/shelfsense-ui-${path === "/" ? "shelves" : "alerts"}-${width}.png`,
            fullPage: true,
          });
        }
      }
      for (const path of [
        "/help",
        "/shelves/new",
        `/shelves/${id}`,
        `/shelves/${id}/setup`,
        `/shelves/${id}/check`,
      ]) {
        await layoutPage.goto(base + path);
        if (path.includes(id)) {
          await expect(
            layoutPage.getByText("Test cereal shelf", { exact: false }).first(),
          ).toBeVisible();
        }
        if (path.endsWith("/setup") || path.endsWith("/check")) {
          const panels = layoutPage.locator(".workflow-panel");
          await expect(panels).toHaveCount(2);
          const first = (await panels.nth(0).boundingBox())!;
          const second = (await panels.nth(1).boundingBox())!;
          if (width >= 768) {
            expect(Math.abs(first.y - second.y)).toBeLessThan(2);
            expect(second.x).toBeGreaterThan(first.x);
          } else {
            expect(second.y).toBeGreaterThan(first.y);
          }
          await expect(layoutPage.getByLabel("Shelf photo")).toHaveCSS(
            "opacity",
            "0",
          );
          if ([1440, 390].includes(width)) {
            await layoutPage.screenshot({
              path: `/tmp/shelfsense-ui-${path.endsWith("/setup") ? "setup" : "check"}-${width}.png`,
              fullPage: true,
            });
          }
        }
        await verifyTypographyAndReadingWidth();
        await expect(layoutPage.locator("body")).toHaveCSS("font-size", "20px");
        await expect(layoutPage.locator("body")).toHaveCSS(
          "line-height",
          "35px",
        );
        await expect(layoutPage.locator("body")).toHaveCSS(
          "font-family",
          /sans-serif/,
        );
        if (path === "/help" && [1440, 390].includes(width)) {
          await layoutPage.screenshot({
            path: `/tmp/shelfsense-ui-help-${width}.png`,
            fullPage: true,
          });
        }
      }
    }
    await layoutPage.close();
    if (errors.length) throw Error(errors.join("; "));
    console.log(
      "PASS: empty workspace, create/setup/check pages, real uploads, alerts and verification, URL filters, Back/Forward, keyboard area selection, folder restart deduplication; 1/2-column shelves and alerts, three font sizes, centered layouts and direct workflow exits and no overflow across seven screen widths.",
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
