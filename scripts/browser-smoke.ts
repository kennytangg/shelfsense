import AxeBuilder from "@axe-core/playwright";
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
    await expect(page.locator("[role=article]")).toHaveCount(0);
    await page
      .getByRole("link", { name: "Add shelf", exact: true })
      .first()
      .click();
    await expect(
      page
        .getByRole("navigation", { name: "Shelf progress" })
        .locator('[aria-current="step"]'),
    ).toContainText("Add shelf");
    await page.getByLabel("Shelf name").fill("Test cereal shelf");
    await page.getByLabel("Location", { exact: true }).fill("Aisle 1");
    await page.getByRole("button", { name: "Add shelf", exact: true }).click();
    await expect(page).toHaveURL(/\/setup$/);
    const id = new URL(page.url()).pathname.split("/")[2];
    const progress = page.getByRole("navigation", { name: "Shelf progress" });
    await expect(progress.locator('[aria-current="step"]')).toContainText(
      "Set up",
    );
    await expect(
      progress.getByText("Check stock", { exact: true }),
    ).toBeVisible();
    const breadcrumbs = page.getByRole("navigation", {
      name: "Breadcrumb",
      exact: true,
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Set up shelf",
    );
    await breadcrumbs.getByRole("link", { name: "Test cereal shelf" }).click();
    await expect(page).toHaveURL(`${base}/shelves/${id}`);
    await page.goto(`${base}/shelves/${id}/setup`);
    await expect(
      page.getByRole("button", { name: "Save setup", exact: true }),
    ).toBeDisabled();
    const cancel = breadcrumbs.getByRole("link", {
      name: "Shelves",
      exact: true,
    });
    expect((await cancel.boundingBox())!.y).toBeLessThan(300);
    await cancel.click();
    await expect(page).toHaveURL(base + "/");
    await page.goto(base + "/shelves/" + id + "/setup");
    const sharp = (await import("sharp")).default;
    for (const [width, height] of [
      [160, 320],
      [320, 160],
    ]) {
      await page.getByLabel("Shelf photo").setInputFiles({
        name: "geometry.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: { width, height, channels: 3, background: "#bbb" },
        })
          .png()
          .toBuffer(),
      });
      const selection = page.getByRole("group", {
        name: /Shelf area selection/,
      });
      const image = selection.getByRole("img");
      await expect(image).toBeVisible();
      await expect
        .poll(async () => {
          const box = (await image.boundingBox())!;
          return Math.abs(box.width / box.height - width / height);
        })
        .toBeLessThan(0.01);
      const imageBox = (await image.boundingBox())!,
        canvas = (await selection.boundingBox())!;
      expect(Math.abs(imageBox.x - canvas.x)).toBeLessThan(1);
      expect(Math.abs(imageBox.y - canvas.y)).toBeLessThan(1);
      expect(Math.abs(imageBox.width - canvas.width)).toBeLessThan(1);
      expect(Math.abs(imageBox.height - canvas.height)).toBeLessThan(1);
      await page.mouse.move(
        canvas.x + canvas.width * 0.25,
        canvas.y + canvas.height * 0.25,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvas.x + canvas.width * 0.75,
        canvas.y + canvas.height * 0.75,
      );
      await page.mouse.up();
      const region = (await selection
        .locator(".pointer-events-none")
        .boundingBox())!;
      expect(Math.abs(region.width / canvas.width - 0.5)).toBeLessThan(0.02);
      expect(Math.abs(region.height / canvas.height - 0.5)).toBeLessThan(0.02);
    }
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
      .getByRole("navigation", { name: "Breadcrumb", exact: true })
      .getByRole("link", { name: "Shelves", exact: true })
      .click();
    await expect(page).toHaveURL(base + "/");
    await page.goto(base + "/shelves/" + id + "/check");
    await page
      .getByRole("navigation", { name: "Breadcrumb", exact: true })
      .getByRole("link", { name: "Shelves", exact: true })
      .click();
    await expect(page).toHaveURL(base + "/");
    async function selectStock(value: string) {
      await page.getByRole("combobox", { name: "Measured stock" }).click();
      await page.getByRole("option", { name: value, exact: true }).click();
    }
    async function assertComparison() {
      await expect(page.locator(".check-layout .photo-frame")).toHaveCount(2);
      const left = await page
        .locator(".check-layout .photo-frame")
        .first()
        .boundingBox();
      const right = await page
        .locator(".check-layout .photo-frame >> nth=1")
        .boundingBox();
      if (page.viewportSize()!.width >= 768)
        expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
      else expect(right!.y).toBeGreaterThan(left!.y);
      expect(Math.abs(left!.height - right!.height)).toBeLessThan(2);
    }
    await page.goto(`${base}/shelves/${id}/check`);
    await assertComparison();
    const help = page.getByRole("button", {
      name: "Photo guidance",
      exact: true,
    });
    await help.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused();
    await page.getByLabel("Shelf photo").setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
    await expect(page.locator("main [role=alert]")).toContainText(
      "Choose a PNG or JPEG",
    );
    await assertComparison();
    for (const [width, height] of [
      [160, 320],
      [320, 160],
    ]) {
      await page.getByLabel("Shelf photo").setInputFiles({
        name: "framing.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: { width, height, channels: 3, background: "#bbb" },
        })
          .png()
          .toBuffer(),
      });
      await assertComparison();
      await expect(
        page.getByRole("img", { name: "Selected shelf photo preview" }),
      ).toHaveCSS("object-fit", "contain");
    }
    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.evaluate(() => {
      document.body.style.zoom = "";
    });
    async function check(name: string, status: string) {
      await page.goto(base + "/shelves/" + id + "/check");
      await page
        .getByLabel("Shelf photo")
        .setInputFiles("tests/fixtures/shelves/sh-01-" + name + ".png");
      await assertComparison();
      const endpoint = "**/api/shelves/" + id + "/analyses";
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(endpoint, async (route) => {
        await gate;
        await route.continue();
      });
      await page
        .getByRole("button", { name: /^(Check stock|Verify restocking)$/ })
        .click();
      await expect(
        page.getByRole("button", {
          name: /^(Checking stock…|Verifying restocking…)$/,
        }),
      ).toBeDisabled();
      await expect(page.locator("[role=status]")).toBeVisible();
      release();
      await expect(page).toHaveURL(base + "/shelves/" + id);
      await page.unroute(endpoint);
      await expect(page.locator("[data-slot=badge]")).toHaveText(status, {
        timeout: 30000,
      });
    }
    await page.goto(`${base}/shelves/${id}/check`);
    await page
      .getByLabel("Shelf photo")
      .setInputFiles("tests/fixtures/shelves/mismatched.png");
    await page
      .getByRole("button", { name: /^(Check stock|Verify restocking)$/ })
      .click();
    await expect(page).toHaveURL(`${base}/shelves/${id}`);
    await expect(
      page.getByRole("heading", { name: "No valid result" }),
    ).toBeVisible();
    await expect(page.locator("main [role=alert]")).toHaveCount(1);
    await check("low", "Low");
    await page.goto(base + "/shelves/" + id + "/check");
    await page
      .getByLabel("Shelf photo")
      .setInputFiles("tests/fixtures/shelves/mismatched.png");
    await page
      .getByRole("button", { name: /^(Check stock|Verify restocking)$/ })
      .click();
    await expect(page).toHaveURL(base + "/shelves/" + id);
    await expect(page.locator("[data-slot=badge]")).toHaveText("Low");
    await expect(
      page.getByText("Photo check needs attention.", { exact: false }),
    ).toBeVisible();
    await expect(page.locator("main [role=alert]")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Previous valid result" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Report restocked", exact: true })
      .click();
    await expect(
      page.getByText("Awaiting photo verification", { exact: false }),
    ).toBeVisible();
    await expect(page.locator("[data-slot=badge]")).toHaveText("Low");
    await page.goto(base + "/?view=verification");
    await expect(page.locator("[role=article]")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Verify stock", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Awaiting photo verification", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Photo needs review", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("article").locator("[data-slot=badge]"),
    ).toHaveText("Last measured: Low");
    await selectStock("Full");
    await expect(page).toHaveURL(base + "/?view=verification&status=Full");
    await expect(
      page.getByText("No shelves match", { exact: false }),
    ).toContainText("Awaiting verification · Full stock");
    await page.getByRole("link", { name: "Clear stock filter" }).click();
    await expect(page).toHaveURL(base + "/?view=verification");
    await page.reload();
    await expect(page.locator("[role=article]")).toHaveCount(1);
    await page.getByRole("link", { name: "Verify stock", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Verify restocking",
    );
    await expect(
      page.locator(".workflow-progress .progress-complete"),
    ).toHaveCount(2);
    await expect(page.locator("[data-slot=alert]")).toContainText(
      "Restocking reported. Add a photo to verify stock.",
    );
    await expect(page.locator(".notice.success, [role=status]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Verify restocking", exact: true }),
    ).toBeDisabled();
    await page.goto(base + "/alerts");
    await expect(page.locator("[role=article]")).toHaveCount(1);
    await expect(page).toHaveURL(base + "/?view=attention");
    await check("full", "Full");
    await page.goto(base + "/alerts");
    await expect(
      page.getByText("No shelves match", { exact: false }),
    ).toBeVisible();
    await check("reference", "Empty");
    await page.goto(base);
    await selectStock("Empty");
    await expect(page).toHaveURL(base + "/?status=Empty");
    await page.reload();
    await expect(page.locator("[role=article]")).toHaveCount(1);
    await selectStock("Full");
    await expect(
      page.getByRole("link", { name: "Show all shelves" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Measured stock", { exact: true })).toHaveText(
      "Empty",
    );
    await page.goForward();
    await expect(page.getByLabel("Measured stock", { exact: true })).toHaveText(
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
    await expect(page.locator("[data-slot=badge]")).toHaveText("Empty");
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
    const layoutContext = await browser.newContext();
    const layoutPage = await layoutContext.newPage();
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
          const faces = await document.fonts.load('20px "Noto Sans"');
          return (
            faces.length > 0 && faces.every((face) => face.status === "loaded")
          );
        }),
      ).toBe(true);
      await expect(layoutPage.locator("body")).toHaveCSS(
        "font-family",
        /Noto Sans/,
      );
      await expect(
        layoutPage
          .getByRole("link", { name: "ShelfSense home" })
          .locator("span"),
      ).toHaveCSS("font-family", /Bitstream Charter/);
      for (const element of await layoutPage
        .locator("nav a, button, input, select, .card-location, figcaption")
        .all()) {
        await expect(element).toHaveCSS("font-family", /Noto Sans/);
      }
      for (const badge of await layoutPage.locator("[data-slot=badge]").all()) {
        await expect(badge).toHaveCSS("font-family", /Noto Sans/);
      }
      await expect(layoutPage.locator("h1")).toHaveCount(1);
      await expect(layoutPage.locator("h1")).toHaveCSS("font-size", "28px");
      await expect(layoutPage.locator("h1")).toHaveCSS("font-weight", "400");
      for (const heading of await layoutPage.locator("h2").all()) {
        await expect(heading).toHaveCSS("font-size", "18px");
      }
      for (const filter of await layoutPage.locator(".task-filters a").all()) {
        await expect(filter).toHaveCSS("font-size", "14px");
        await expect(filter).toHaveCSS("font-weight", "400");
        await filter.focus();
        await expect(filter).toHaveCSS("outline-style", "solid");
        await expect(filter).toHaveCSS("font-weight", "400");
      }
      for (const link of await layoutPage
        .locator("header nav a, .task-filters a")
        .all()) {
        await layoutPage.mouse.move(0, 0);
        const background = await link.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        );
        await link.hover();
        await expect(link).toHaveCSS("text-decoration-line", "underline");
        await expect(link).toHaveCSS("background-color", background);
      }
      const reading = await layoutPage
        .locator(".reading-container, main.collection-page")
        .first()
        .boundingBox();
      expect(reading).not.toBeNull();
      expect(reading!.width).toBeLessThanOrEqual(1600);
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
    for (const width of [
      1920, 1440, 1280, 1024, 768, 640, 639, 390, 360, 320,
    ]) {
      await layoutPage.setViewportSize({ width, height: 1100 });
      for (const path of ["/", "/alerts"]) {
        await layoutPage.goto(base + path);
        const cards = layoutPage.locator("[role=article]");
        await expect(cards).toHaveCount(6);
        const boxes = await cards.evaluateAll((cards) =>
          cards.map((card) => {
            const { x, y, width } = card.getBoundingClientRect();
            return { x, y, width };
          }),
        );
        const row = boxes.filter((box) => Math.abs(box.y - boxes[0].y) < 2);
        for (const box of boxes)
          expect(box.width).toBeGreaterThanOrEqual(Math.min(320, width - 64));
        for (const box of row)
          expect(Math.abs(box.width - boxes[0].width)).toBeLessThan(2);
        const stock = layoutPage.getByRole("combobox", {
          name: "Measured stock",
        });
        const textFit = await stock.evaluate((el) =>
          [...el.querySelectorAll("span")].every(
            (span) => span.scrollWidth <= span.clientWidth + 1,
          ),
        );
        expect(textFit).toBe(true);
        await stock.focus();
        await layoutPage.keyboard.press("ArrowDown");
        await expect(
          layoutPage.getByRole("option", {
            name: "All stock levels",
            exact: true,
          }),
        ).toBeVisible();
        const popup = (await layoutPage.getByRole("listbox").boundingBox())!;
        expect(popup.x).toBeGreaterThanOrEqual(0);
        expect(popup.x + popup.width).toBeLessThanOrEqual(width + 1);
        await layoutPage.keyboard.press("Escape");
        await expect(stock).toBeFocused();
        await layoutPage.keyboard.press("Space");
        await expect(layoutPage.getByRole("listbox")).toBeVisible();
        await layoutPage.keyboard.press("l");
        await expect(
          layoutPage.getByRole("option", { name: "Low", exact: true }),
        ).toBeFocused();
        await layoutPage.keyboard.press("Enter");
        await expect(stock).toHaveText("Low");
        await verifyTypographyAndReadingWidth();
        await expect(layoutPage.locator(".alert-evidence")).toHaveCount(0);
        if ([1440, 1280, 768, 390, 360].includes(width)) {
          await layoutPage.mouse.move(0, 0);
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
        if (path === `/shelves/${id}` && [1440, 390].includes(width)) {
          await layoutPage.screenshot({
            path: `/tmp/shelfsense-ui-detail-${width}.png`,
            fullPage: true,
          });
          await layoutPage
            .getByRole("button", { name: "Check details", exact: true })
            .click();
          await layoutPage.screenshot({
            path: `/tmp/shelfsense-ui-dialog-${width}.png`,
            fullPage: true,
          });
          await layoutPage.keyboard.press("Escape");
        }
        const progress = layoutPage.getByRole("navigation", {
          name: /progress/,
        });
        if (await progress.count()) {
          await expect(progress.locator('[aria-current="step"]')).toHaveCount(
            1,
          );
          for (const marker of await progress
            .locator("[data-step-marker]")
            .all()) {
            const geometry = await marker.evaluate((el) => {
              const style = getComputedStyle(el),
                rect = el.getBoundingClientRect();
              return {
                width: rect.width,
                height: rect.height,
                display: style.display,
                align: style.alignItems,
                justify: style.justifyItems,
                line: style.lineHeight,
              };
            });
            expect(geometry).toEqual({
              width: 32,
              height: 32,
              display: "grid",
              align: "center",
              justify: "center",
              line: "14px",
            });
          }
        }
        await verifyTypographyAndReadingWidth();
        await expect(layoutPage.locator("body")).toHaveCSS("font-size", "16px");
        await expect(layoutPage.locator("body")).toHaveCSS(
          "line-height",
          "24px",
        );
        await expect(layoutPage.locator("body")).toHaveCSS(
          "font-family",
          /Noto Sans/,
        );
        if (path === "/help") {
          await expect(layoutPage.locator("main p").first()).toHaveCSS(
            "font-family",
            /Bitstream Charter/,
          );
          await expect(layoutPage.locator("main ol")).toHaveCSS(
            "font-family",
            /Bitstream Charter/,
          );
          await expect(layoutPage.locator("h1")).toHaveCSS(
            "font-family",
            /Noto Sans/,
          );
          expect(
            await layoutPage.evaluate(
              async () =>
                (await document.fonts.load('20px "Bitstream Charter"')).length,
            ),
          ).toBeGreaterThan(0);
        }
        if (path === "/help" && [1440, 390].includes(width)) {
          await layoutPage.screenshot({
            path: `/tmp/shelfsense-ui-help-${width}.png`,
            fullPage: true,
          });
        }
      }
    }
    for (const path of [
      "/",
      "/help",
      "/shelves/new",
      "/shelves/" + id + "/setup",
      "/shelves/" + id + "/check",
    ]) {
      await layoutPage.setViewportSize({ width: 1280, height: 1100 });
      await layoutPage.goto(base + path);
      await expect(layoutPage.locator("h1")).toBeVisible();
      const { violations } = await new AxeBuilder({ page: layoutPage })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(violations, "Accessibility: " + path).toEqual([]);
    }
    for (const width of [360, 768, 1280, 1440]) {
      await layoutPage.setViewportSize({ width, height: 1100 });
      for (const view of ["restocking", "verification"]) {
        await layoutPage.goto(base + "/?view=" + view);
        await expect(
          layoutPage.locator('.task-filters [aria-current="page"]'),
        ).toBeVisible();
        await layoutPage.mouse.move(0, 0);
        await layoutPage.screenshot({
          path: "/tmp/shelfsense-ui-" + view + "-" + width + ".png",
          fullPage: true,
        });
      }
    }
    const touchContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      hasTouch: true,
      isMobile: true,
    });
    const touchPage = await touchContext.newPage();
    await touchPage.goto(base + "/shelves/" + id + "/check");
    await touchPage
      .getByRole("button", { name: "Photo guidance", exact: true })
      .tap();
    await expect(touchPage.getByRole("dialog")).toBeVisible();
    await touchPage
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .tap();
    await expect(touchPage.getByRole("dialog")).not.toBeVisible();
    await touchPage.goto(base);
    await touchPage.getByRole("combobox", { name: "Measured stock" }).tap();
    await touchPage.getByRole("option", { name: "Low", exact: true }).tap();
    await expect(touchPage).toHaveURL(base + "/?status=Low");
    await touchContext.close();
    await layoutContext.close();
    await page.goto(`${base}/shelves/${id}`);
    await page.getByLabel("Shelf actions").click();
    await page
      .getByRole("menuitem", { name: "Delete shelf", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.screenshot({
      path: "/tmp/shelfsense-ui-delete-dialog.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(page.getByLabel("Shelf actions")).toBeFocused();
    await expect(page).toHaveURL(`${base}/shelves/${id}`);
    await page.getByLabel("Shelf actions").click();
    await page
      .getByRole("menuitem", { name: "Delete shelf", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete shelf", exact: true })
      .click();
    await expect(page).toHaveURL(base + "/");
    await expect(
      page.getByText("Add your first shelf", { exact: false }),
    ).toBeVisible();
    if ((await fetch(`${base}/api/shelves/${id}`)).status !== 404)
      throw Error("Deleted shelf is still available");
    if (errors.length) throw Error(errors.join("; "));
    console.log(
      "PASS: empty workspace, create/setup/check pages, real uploads, alerts and verification, URL filters, Back/Forward, keyboard area selection, folder restart deduplication; responsive readable shelves and task filters, Noto Sans UI and Charter reading typography, centered layouts and direct workflow exits and no overflow across ten screen widths.",
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
  console.error(e.stack || e.message);
  process.exitCode = 1;
});
