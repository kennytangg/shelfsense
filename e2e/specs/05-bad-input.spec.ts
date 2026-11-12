import sharp from "sharp";
import { test, expect } from "../support/test";
import { REAL_PHOTOS, SHELF_IMAGES } from "../support/fixtures";
import { ShelfApi, type ApiShelf } from "../support/api";
import { checkHistory, resultBadge, submitCheck } from "../support/ui";

const MEGABYTE = 1024 * 1024;

test.describe("Bad input", () => {
  let api: ShelfApi;
  let shelf: ApiShelf;
  let taskId: string;

  test.beforeEach(async ({ request }) => {
    api = new ShelfApi(request);
    shelf = await api.createCalibrated("Bad input shelf", "Aisle 4");
    await api.check(shelf.id, "low");
    taskId = (await api.alertsFor(shelf.id))[0].id;
  });

  /** The previous valid Low result and its single open task are untouched. */
  async function expectPreviousResultKept(
    page: import("@playwright/test").Page,
    checks: number,
  ) {
    await page.goto(`/shelves/${shelf.id}`);
    await expect(resultBadge(page)).toHaveText("Low");
    await expect(page.getByText("This shelf needs restocking.")).toBeVisible();
    const tasks = await api.alertsFor(shelf.id);
    expect(tasks.map((task) => [task.id, task.state])).toEqual([
      [taskId, "Open"],
    ]);
    await expect(checkHistory(page).getByRole("listitem")).toHaveCount(checks);
  }

  test("a text file is refused before upload", async ({ page }) => {
    await page.goto(`/shelves/${shelf.id}/check`);
    await page.getByLabel("Shelf photo").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Choose a PNG or JPEG image.",
    );
    await expect(
      page.getByRole("button", { name: "Check stock", exact: true }),
    ).toBeDisabled();
    await expectPreviousResultKept(page, 1);
  });

  test("a file over 10 MB is refused before upload", async ({ page }) => {
    await page.goto(`/shelves/${shelf.id}/check`);
    await page.getByLabel("Shelf photo").setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(11 * MEGABYTE),
    });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Image must be 10 MB or smaller.",
    );
    await expectPreviousResultKept(page, 1);
  });

  test("a corrupt image is rejected with a clear message", async ({ page }) => {
    await submitCheck(page, shelf.id, {
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("this is definitely not png data"),
    });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Cannot decode this image. Choose a complete PNG or JPEG.",
    );
    await expect(page).toHaveURL(`/shelves/${shelf.id}/check`);
    await expectPreviousResultKept(page, 1);
  });

  test("an image with too many pixels is rejected", async ({ page }) => {
    // 25 megapixels of flat grey: tiny to upload, over the 20 MP decode limit.
    const buffer = await sharp({
      create: { width: 5000, height: 5000, channels: 3, background: "#888" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(buffer.length).toBeLessThan(10 * MEGABYTE);
    await submitCheck(page, shelf.id, {
      name: "too-big.png",
      mimeType: "image/png",
      buffer,
    });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Image exceeds the 20 million decoded-pixel limit.",
    );
    await expectPreviousResultKept(page, 1);
  });

  for (const [label, file] of [
    ["portrait illustration", SHELF_IMAGES.mismatchedFraming],
    ["portrait real photograph", REAL_PHOTOS.portraitEggShelf],
  ] as const) {
    test(`${label}: wrong framing needs review and keeps the old result`, async ({
      page,
    }) => {
      await submitCheck(page, shelf.id, file);
      await expect(page).toHaveURL(`/shelves/${shelf.id}`);
      await expect(
        page.getByRole("heading", { name: "Previous valid result" }),
      ).toBeVisible();
      // The red notice carries the specific reason, not a generic message.
      await expect(page.locator("main").getByRole("alert")).toContainText(
        "Retake from the reference position",
      );
      await expect(resultBadge(page)).toHaveText("Low");
      const tasks = await api.alertsFor(shelf.id);
      expect(tasks.map((task) => [task.id, task.state])).toEqual([
        [taskId, "Open"],
      ]);
      await expect(
        page.getByText("This shelf needs restocking."),
      ).toBeVisible();
    });
  }
});
