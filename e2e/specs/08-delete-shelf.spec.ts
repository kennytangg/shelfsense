import { test, expect } from "../support/test";
import { ShelfApi } from "../support/api";

test.describe("Delete shelf", () => {
  test("needs confirmation, then removes the shelf and its tasks", async ({
    page,
    request,
  }) => {
    const api = new ShelfApi(request);
    const shelf = await api.createCalibrated("Doomed shelf", "Aisle 8");
    await api.check(shelf.id, "low");
    expect(await api.alertsFor(shelf.id)).toHaveLength(1);

    await page.goto(`/shelves/${shelf.id}`);
    // Delete lives in the "..." menu, not as a visible button.
    await expect(
      page.getByRole("button", { name: "Delete shelf", exact: true }),
    ).toHaveCount(0);
    const openDelete = async () => {
      await page.getByRole("button", { name: "Shelf actions" }).click();
      await page.getByRole("menuitem", { name: "Delete shelf" }).click();
    };
    await openDelete();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText('Delete "Doomed shelf"?');

    // Cancel keeps everything.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(`/shelves/${shelf.id}`);
    expect((await request.get(`/api/shelves/${shelf.id}`)).status()).toBe(200);

    // Confirm deletes and returns to the dashboard.
    await openDelete();
    await dialog
      .getByRole("button", { name: "Delete shelf", exact: true })
      .click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("article", { name: "Doomed shelf" }),
    ).toHaveCount(0);
    expect((await request.get(`/api/shelves/${shelf.id}`)).status()).toBe(404);
    expect(await api.alertsFor(shelf.id)).toHaveLength(0);
    await page.goto(`/shelves/${shelf.id}`);
    await expect(page.getByRole("alert")).toBeVisible();
  });
});
