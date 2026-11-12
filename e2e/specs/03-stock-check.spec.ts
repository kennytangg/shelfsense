import { test, expect } from "../support/test";
import { REAL_PHOTOS, SHELF_IMAGES } from "../support/fixtures";
import { ShelfApi } from "../support/api";
import {
  addShelfViaForm,
  checkStock,
  resultBadge,
  shelfIdFromUrl,
} from "../support/ui";

test.describe("Stock check", () => {
  test("full, low, then empty photos; one restocking task is created and updated", async ({
    page,
    request,
  }) => {
    const api = new ShelfApi(request);
    const shelf = await api.createCalibrated("Stock check shelf", "Aisle 2");
    const restockPrompt = page.getByText("This shelf needs restocking.");

    await checkStock(page, shelf.id, SHELF_IMAGES.full);
    await expect(resultBadge(page)).toHaveText("Full");
    await expect(restockPrompt).toHaveCount(0);
    expect(await api.alertsFor(shelf.id)).toHaveLength(0);

    await checkStock(page, shelf.id, SHELF_IMAGES.low);
    await expect(resultBadge(page)).toHaveText("Low");
    await expect(restockPrompt).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Report restocked", exact: true }),
    ).toBeVisible();
    const [lowTask] = await api.alertsFor(shelf.id);
    expect(await api.alertsFor(shelf.id)).toHaveLength(1);
    expect(lowTask.severity).toBe("Low");

    // Same shelf gets worse: the one task is escalated, not duplicated.
    await checkStock(page, shelf.id, SHELF_IMAGES.empty);
    await expect(resultBadge(page)).toHaveText("Empty");
    await expect(restockPrompt).toBeVisible();
    const tasks = await api.alertsFor(shelf.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe(lowTask.id);
    expect(tasks[0].severity).toBe("Empty");
  });

  test("real photograph: re-photographing an empty shelf reads Empty", async ({
    page,
  }) => {
    // Set up through the UI with a real JPEG, using the whole image as the area.
    await addShelfViaForm(page, "Egg shelf (real photo)", "Dairy wall");
    const id = shelfIdFromUrl(page);
    await page
      .getByLabel("Shelf photo")
      .setInputFiles(REAL_PHOTOS.emptyEggShelf);
    await page.getByRole("button", { name: "Save setup", exact: true }).click();
    await expect(page).toHaveURL(`/shelves/${id}/check`);

    // The same viewpoint again (here: the same photograph) has no new stock.
    await checkStock(page, id, REAL_PHOTOS.emptyEggShelf);
    await expect(resultBadge(page)).toHaveText("Empty");
  });
});
