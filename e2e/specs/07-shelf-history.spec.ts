import { test, expect } from "../support/test";
import { ShelfApi } from "../support/api";
import { checkHistory, checkStock } from "../support/ui";
import { SHELF_IMAGES } from "../support/fixtures";

test.describe("Shelf history", () => {
  test("Check history lists checks newest first with status and coverage", async ({
    page,
    request,
  }) => {
    const api = new ShelfApi(request);
    const shelf = await api.createCalibrated("History shelf", "Aisle 5");

    // No checks yet: the card is not shown.
    await page.goto(`/shelves/${shelf.id}`);
    await expect(checkHistory(page)).toHaveCount(0);

    await checkStock(page, shelf.id, SHELF_IMAGES.full);
    await checkStock(page, shelf.id, SHELF_IMAGES.low);
    await checkStock(page, shelf.id, SHELF_IMAGES.empty);

    const history = checkHistory(page);
    await expect(
      history.getByRole("heading", { name: "Check history" }),
    ).toBeVisible();
    const rows = history.getByRole("listitem");
    await expect(rows).toHaveCount(3);
    // Newest first: Empty, then Low, then Full.
    await expect(rows.nth(0).locator("[data-slot=badge]")).toHaveText("Empty");
    await expect(rows.nth(1).locator("[data-slot=badge]")).toHaveText("Low");
    await expect(rows.nth(2).locator("[data-slot=badge]")).toHaveText("Full");
    // Coverage is the share of the monitored area that is stocked.
    await expect(rows.nth(0)).toContainText("Coverage 0.0%");
    await expect(rows.nth(1)).toContainText(/Coverage 3\d\.\d%/);
    await expect(rows.nth(2)).toContainText(/Coverage 7\d\.\d%/);
    // Each row carries a date and time.
    for (const row of await rows.all()) {
      await expect(row.locator("span").first()).not.toHaveText("");
    }
  });
});
