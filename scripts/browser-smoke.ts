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
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
      }),
      page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let releaseShelves!: () => void;
    const shelvesGate = new Promise<void>((resolve) => {
      releaseShelves = resolve;
    });
    await page.route("**/api/shelves", async (route) => {
      await shelvesGate;
      await route.continue();
    });
    await page.goto(base);
    const loadingShelves = page.getByRole("status", {
      name: "Loading shelves",
      exact: true,
    });
    await expect(loadingShelves).toBeVisible();
    await expect(loadingShelves.locator("[data-slot=card]")).toHaveCount(6);
    await expect(
      page.getByText("Add your first shelf", { exact: false }),
    ).toHaveCount(0);
    releaseShelves();
    await expect(loadingShelves).toHaveCount(0);
    await page.unroute("**/api/shelves");
    await expect(
      page.getByText("Add your first shelf", { exact: false }),
    ).toBeVisible();
    await expect(page.locator("[role=article]")).toHaveCount(0);
    await page
      .getByRole("link", { name: "Add shelf", exact: true })
      .first()
      .click();
    const breadcrumbs = page.getByRole("navigation", {
      name: "Breadcrumb",
      exact: true,
    });
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
      "New shelf",
    );
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
    const loadingContext = await browser.newContext();
    const loadingPage = await loadingContext.newPage();
    for (const path of [
      `/shelves/${id}`,
      `/shelves/${id}/setup`,
      `/shelves/${id}/check`,
    ]) {
      let releaseShelf!: () => void;
      const shelfGate = new Promise<void>((resolve) => {
        releaseShelf = resolve;
      });
      await loadingPage.route(`**/api/shelves/${id}`, async (route) => {
        await shelfGate;
        await route.continue();
      });
      await loadingPage.goto(base + path);
      const loadingShelf = loadingPage.getByRole("status", {
        name: "Loading shelf",
        exact: true,
      });
      await expect(loadingShelf).toBeVisible();
      await expect(
        loadingShelf.locator("[data-slot=skeleton]").first(),
      ).toBeVisible();
      releaseShelf();
      await expect(loadingShelf).toHaveCount(0);
      await loadingPage.unroute(`**/api/shelves/${id}`);
    }
    await loadingContext.close();
    const progress = page.getByRole("navigation", { name: "Shelf progress" });
    await expect(progress.locator('[aria-current="step"]')).toContainText(
      "Set up",
    );
    await expect(
      progress.getByText("Check stock", { exact: true }),
    ).toBeVisible();
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
      "Setup",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Set up shelf",
    );
    await breadcrumbs.getByRole("link", { name: "Test cereal shelf" }).click();
    await expect(page).toHaveURL(`${base}/shelves/${id}`);
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
      "Test cereal shelf",
    );
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
    const unconfiguredCard = page.getByRole("article");
    await expect(unconfiguredCard.getByRole("link")).toHaveCount(1);
    await unconfiguredCard
      .getByRole("link", { name: "View shelf", exact: true })
      .click();
    await expect(page).toHaveURL(`${base}/shelves/${id}`);
    await page.getByRole("link", { name: "Set up shelf", exact: true }).click();
    await expect(page).toHaveURL(`${base}/shelves/${id}/setup`);
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
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
      "Stock check",
    );
    await expect(
      breadcrumbs.getByRole("link", { name: "Test cereal shelf" }),
    ).toHaveAttribute("href", `/shelves/${id}`);
    await page.goBack();
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
      "Setup",
    );
    await page.goForward();
    await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(
      "Stock check",
    );
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
    await expect(
      page.getByText("Upload a current photo to update", { exact: false }),
    ).toBeVisible();
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
      await page.getByRole("button", { name: /^Check stock$/ }).click();
      await expect(
        page.getByRole("button", {
          name: /^Checking stock…$/,
        }),
      ).toBeDisabled();
      await expect(page.locator("[role=status]")).toBeVisible();
      release();
      await expect(page).toHaveURL(base + "/shelves/" + id);
      await page.unroute(endpoint);
      await expect(page.locator("[data-slot=badge]")).toHaveText(status, {
        timeout: 30000,
      });
      await page.goto(base);
      const card = page.getByRole("article");
      await expect(card.locator("[data-slot=badge]")).toHaveText(status);
      await expect(card).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(card.locator("h2")).toHaveText("Test cereal shelf");
      await expect(card.locator("h2 a")).toHaveCount(0);
      await page.mouse.move(0, 0);
      await expect(
        card.getByRole("link", { name: "View shelf", exact: true }),
      ).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(
        card.getByRole("link", { name: "View shelf", exact: true }),
      ).toHaveAttribute("href", `/shelves/${id}`);
      const headingBox = (await card.locator("h2").boundingBox())!;
      const badgeBox = (await card.locator("[data-slot=badge]").boundingBox())!;
      expect(badgeBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
      expect(Math.abs(badgeBox.y - headingBox.y)).toBeLessThan(2);
      await expect(
        card.getByText(
          status === "Full"
            ? "Stock looks sufficient. No restocking needed."
            : status === "Low"
              ? "Stock is running low. Top up this shelf."
              : "Shelf is empty. Refill it as soon as possible.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        card.getByRole("button", { name: "Delete shelf", exact: true }),
      ).toHaveCount(0);
      await expect(card.getByRole("link")).toHaveCount(1);
      await card.getByRole("link", { name: "View shelf", exact: true }).click();
      await expect(page).toHaveURL(base + "/shelves/" + id);
      if (status !== "Full") {
        await expect(
          page.getByRole("button", { name: "Report restocked", exact: true }),
        ).toBeVisible();
      }
      await page.goto(base + "/shelves/" + id);
    }
    await page.goto(`${base}/shelves/${id}/check`);
    await page
      .getByLabel("Shelf photo")
      .setInputFiles("tests/fixtures/shelves/mismatched.png");
    await page.getByRole("button", { name: /^Check stock$/ }).click();
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
    await page.getByRole("button", { name: /^Check stock$/ }).click();
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
      page.getByText(
        "Restock reported. Check stock with a new photo to update the result.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(page.locator("[data-slot=badge]")).toHaveText("Low");
    await page.goto(base + "/?view=verification");
    await expect(page.locator("[role=article]")).toHaveCount(1);
    await expect(
      page
        .getByRole("article")
        .getByRole("link", { name: "View shelf", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Restock reported. Check stock with a new photo to update the result.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(
      page.getByText("Photo needs review", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("article").locator("[data-slot=badge]"),
    ).toHaveText("Low");
    await expect(
      page.getByRole("combobox", { name: "Measured stock" }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.locator("[role=article]")).toHaveCount(1);
    await expect(page.getByRole("article").getByRole("link")).toHaveCount(1);
    await page.getByRole("link", { name: "View shelf", exact: true }).click();
    await expect(page).toHaveURL(`${base}/shelves/${id}`);
    await page
      .getByRole("link", { name: "Verify restock", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Check stock",
    );
    await expect(page.locator(".workflow-progress")).toHaveCount(0);
    await expect(
      page.getByText("Match the saved reference framing.", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".notice.success, [role=status]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Check stock", exact: true }),
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
    await page
      .getByRole("link", { name: "Needs restocking", exact: true })
      .click();
    await expect(page).toHaveURL(base + "/?view=restocking");
    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(
      page.getByRole("article").locator("[data-slot=badge]"),
    ).toHaveText("Empty");
    await page
      .getByRole("link", { name: "Restock reported", exact: true })
      .click();
    await expect(
      page.getByText("No shelves match", { exact: false }),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("article")).toHaveCount(1);
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
    console.log(
      "PASS: stock checks, restocking, verification and folder ingestion",
    );

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
        const weight =
          (await filter.getAttribute("aria-current")) === "page"
            ? "700"
            : "400";
        await expect(filter).toHaveCSS("font-size", "14px");
        await expect(filter).toHaveCSS("font-weight", weight);
        await filter.focus();
        await expect(filter).toHaveCSS("outline-style", "solid");
        await expect(filter).toHaveCSS("font-weight", weight);
      }
      for (const link of await layoutPage
        .locator('nav[aria-label="Main navigation"] a, .task-filters a')
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
        for (const card of await cards.all()) {
          await expect(card.getByRole("link")).toHaveCount(1);
          await expect(
            card.getByRole("link", { name: "View shelf", exact: true }),
          ).toBeVisible();
        }
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
        await expect(
          layoutPage.getByRole("navigation", { name: "Shelf tasks" }),
        ).toBeVisible();
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
        if (path === `/shelves/${id}`) {
          await expect(
            layoutPage.locator("button:has(svg.lucide-info)"),
          ).toHaveCount(1);
        }
        if (path === `/shelves/${id}` && [1440, 390].includes(width)) {
          await layoutPage.screenshot({
            path: `/tmp/shelfsense-ui-detail-${width}.png`,
            fullPage: true,
          });
          await layoutPage
            .getByRole("button", {
              name: "Shelf guide and details",
              exact: true,
            })
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
    await expect(
      touchPage.getByText("Upload a current photo to update", { exact: false }),
    ).toBeVisible();
    await touchPage.goto(base);
    await touchPage
      .getByRole("link", { name: "Needs restocking", exact: true })
      .tap();
    await expect(touchPage).toHaveURL(base + "/?view=restocking");
    await touchContext.close();
    await layoutContext.close();
    console.log(
      "PASS: responsive layouts and accessibility across existing workflows",
    );
    await page.goto(`${base}/shelves/${id}`);
    // Existing placement metadata must not reintroduce placement UI.
    const existingShelf = await (
      await fetch(base + "/api/shelves/" + id)
    ).json();
    const placementReference = new FormData();
    placementReference.append(
      "file",
      new Blob([await readFile("tests/fixtures/shelves/sh-01-full.png")], {
        type: "image/png",
      }),
      "full.png",
    );
    placementReference.append(
      "calibration_version",
      String(existingShelf.calibration_version),
    );
    expect(
      (
        await fetch(base + "/api/shelves/" + id + "/placement", {
          method: "POST",
          body: placementReference,
        })
      ).status,
    ).toBe(200);
    const misplacedPhoto = new FormData();
    misplacedPhoto.append(
      "file",
      new Blob([await readFile("tests/fixtures/shelves/sh-01-misplaced.png")], {
        type: "image/png",
      }),
      "current.png",
    );
    const placementCheck = await fetch(
      base + "/api/shelves/" + id + "/analyses",
      { method: "POST", body: misplacedPhoto },
    );
    expect(placementCheck.status).toBe(201);
    expect((await placementCheck.json()).placement_result.status).toBe(
      "Placement review",
    );
    await page.goto(base + "/?view=placement");
    await expect(
      page.locator('.task-filters [aria-current="page"]'),
    ).toHaveText("All");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.locator(".task-filters a")).toHaveText([
      "All",
      "Needs restocking",
      "Restock reported",
    ]);
    await expect(
      page.getByRole("link", { name: "Review product placement", exact: true }),
    ).toHaveCount(0);
    await page.goto(base + "/?view=attention");
    await expect(
      page.getByText("No shelves match", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.goto(base + "/help");
    await expect(
      page.getByRole("heading", { name: "Help", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/placement|misplaced/i)).toHaveCount(0);
    await page.goto(base + "/shelves/" + id + "/check");
    await expect(
      page.getByRole("heading", { name: "Check stock", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/placement/i)).toHaveCount(0);
    await page.goto(base + "/shelves/" + id);
    await expect(page.locator("[data-slot=badge]")).toHaveText("Full");
    await expect(
      page.locator("#placement-setup, #placement-result"),
    ).toHaveCount(0);
    await expect(page.getByText(/placement|correctly arranged/i)).toHaveCount(
      0,
    );
    const { violations: detailViolations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(detailViolations, "Shelf details accessibility").toEqual([]);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      await expect(page.locator("h1")).toBeVisible();
      const titleBox = (await page.locator("h1").boundingBox())!;
      const guideBox = (await page
        .getByRole("button", {
          name: "Shelf guide and details",
          exact: true,
        })
        .boundingBox())!;
      expect(guideBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
      expect(
        Math.abs(
          guideBox.y + guideBox.height / 2 - titleBox.y - titleBox.height / 2,
        ),
      ).toBeLessThan(2);
      await page.locator("h1").click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: "/tmp/shelfsense-stock-detail-" + width + ".png",
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Delete shelf", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.screenshot({
      path: "/tmp/shelfsense-ui-delete-dialog.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete shelf", exact: true }),
    ).toBeFocused();
    await expect(page).toHaveURL(`${base}/shelves/${id}`);
    await page
      .getByRole("button", { name: "Delete shelf", exact: true })
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
      "PASS: empty workspace, create/setup/check pages, real uploads, alerts and verification, URL filters, Back/Forward, keyboard area selection, folder restart deduplication; responsive layouts across ten widths; stock-only UI with hidden placement controls/results even when placement metadata exists; accessible mobile/desktop shelf details.",
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
