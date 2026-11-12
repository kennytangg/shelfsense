import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "../support/test";
import {
  addShelfViaForm,
  dragMonitoredArea,
  resultBadge,
  shelfIdFromUrl,
  submitCheck,
} from "../support/ui";

/**
 * Local only. These photographs are all-rights-reserved: they live in the
 * git-excluded local-samples/ folder and must never be committed or copied
 * into e2e/fixtures.
 */
const SAMPLES = resolve(
  import.meta.dirname,
  "..",
  "..",
  "local-samples",
  "real-bookshelf",
);
const photo = (name: string) => resolve(SAMPLES, name);
const AREA = { x: 0.26, y: 0.235, width: 0.5, height: 0.71 };

test.describe("Real bookshelf photos (local only)", () => {
  test.skip(
    !existsSync(SAMPLES),
    "local-samples/real-bookshelf/ is not present (private photos, never committed)",
  );

  test("empty, half, full and a repeated photo on one real shelf", async ({
    page,
    request,
  }) => {
    await addShelfViaForm(page, "Real bookshelf", "Study wall");
    const id = shelfIdFromUrl(page);
    await page
      .getByLabel("Shelf photo")
      .setInputFiles(photo("01-empty-reference.jpg"));
    await dragMonitoredArea(page, AREA);
    await page
      .getByLabel("Fully stocked photo")
      .setInputFiles(photo("04-full.jpg"));
    await page.getByRole("button", { name: "Save setup", exact: true }).click();
    await expect(page).toHaveURL(`/shelves/${id}/check`);

    const restockPrompt = page.getByText("This shelf needs restocking.");
    const duplicate = page.getByText(
      "This photo was already checked. Showing the earlier result.",
    );
    const check = async (file: string) => {
      await submitCheck(page, id, photo(file));
      await expect(page).toHaveURL(
        new RegExp(`/shelves/${id}(\\?duplicate=1)?$`),
      );
    };

    await check("02-empty-again.jpg");
    await expect(resultBadge(page)).toHaveText("Empty");
    await expect(restockPrompt).toBeVisible();

    await check("03-half.jpg");
    await expect(resultBadge(page)).toHaveText("Low");

    await check("05-full-again.jpg");
    await expect(resultBadge(page)).toHaveText("Full");
    await expect(restockPrompt).toHaveCount(0);
    await expect(duplicate).toHaveCount(0);

    // Browser uploads to a local server are not deduplicated (hosted uploads
    // and the folder watcher are), so send the same photo the watcher's way.
    const send = () =>
      request.post(`/api/shelves/${id}/analyses`, {
        multipart: {
          file: {
            name: "photo.jpg",
            mimeType: "image/jpeg",
            buffer: readFileSync(photo("05-full-again.jpg")),
          },
          ingestion: "true",
        },
      });
    expect((await (await send()).json()).duplicate).toBe(false);
    expect((await (await send()).json()).duplicate).toBe(true);
    await page.goto(`/shelves/${id}?duplicate=1`);
    await expect(duplicate).toBeVisible();
    await expect(resultBadge(page)).toHaveText("Full");
  });

  test("the same photo as both empty and stocked reference is refused", async ({
    page,
  }) => {
    await addShelfViaForm(page, "Same photo shelf", "Study wall");
    await page
      .getByLabel("Shelf photo")
      .setInputFiles(photo("01-empty-reference.jpg"));
    await dragMonitoredArea(page, AREA);
    await page
      .getByLabel("Fully stocked photo")
      .setInputFiles(photo("01-empty-reference.jpg"));
    await page.getByRole("button", { name: "Save setup", exact: true }).click();
    await expect(
      page.getByText(/looks the same as the empty one/),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/setup$/);
  });
});
