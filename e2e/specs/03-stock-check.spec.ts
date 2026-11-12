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
    // One action only: the header has no second "Restock shelf" button.
    await expect(page.getByRole("link", { name: "Restock shelf" })).toHaveCount(
      0,
    );
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

  test("a photo that was already checked says so", async ({
    page,
    request,
  }) => {
    // The browser upload to a local server does not deduplicate (hosted
    // uploads and the folder watcher do), so the duplicate response is
    // produced the way the watcher does it: with ingestion=true.
    const api = new ShelfApi(request);
    const shelf = await api.createCalibrated("Duplicate shelf", "Aisle 4");
    const first = await api.check(shelf.id, "full", { ingestion: true });
    expect(first.duplicate).toBe(false);
    const second = await api.check(shelf.id, "full", { ingestion: true });
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);

    const note = page.getByText(
      "This photo was already checked. Showing the earlier result.",
    );
    await page.goto(`/shelves/${shelf.id}`);
    await expect(resultBadge(page)).toHaveText("Full");
    await expect(note).toHaveCount(0);
    // The check page sends people here after a duplicate response.
    await page.goto(`/shelves/${shelf.id}?duplicate=1`);
    await expect(note).toBeVisible();
    await expect(resultBadge(page)).toHaveText("Full");
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
