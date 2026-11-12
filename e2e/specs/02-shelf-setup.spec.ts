import { test, expect } from "../support/test";
import { SHELF_IMAGES } from "../support/fixtures";
import {
  addShelfViaForm,
  resultBadge,
  selectFixtureArea,
  shelfIdFromUrl,
} from "../support/ui";

test.describe("Shelf setup", () => {
  test("manager adds a shelf, uploads the empty photo and marks the area", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Add shelf" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Add shelf",
    );

    await addShelfViaForm(page, "Cereal aisle shelf", "Aisle 1, middle");
    const id = shelfIdFromUrl(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Set up shelf",
    );
    // Save is blocked until a reference photo is chosen.
    const save = page.getByRole("button", { name: "Save setup", exact: true });
    await expect(save).toBeDisabled();

    // On the dashboard the new shelf still says "Needs setup".
    await page.goto("/");
    const card = page.getByRole("article", { name: "Cereal aisle shelf" });
    await expect(card.locator("[data-slot=badge]")).toHaveText("Needs setup");

    await page.goto(`/shelves/${id}/setup`);
    await page.getByLabel("Shelf photo").setInputFiles(SHELF_IMAGES.empty);
    await expect(
      page.getByRole("img", {
        name: "Setup reference; draw the measurement region",
      }),
    ).toBeVisible();
    await selectFixtureArea(page);
    // Required fully stocked photo: shown with plain wording, removable.
    await expect(
      page.getByRole("heading", { name: "Fully stocked photo" }),
    ).toBeVisible();
    await expect(
      page.getByText("Shows ShelfSense what full looks like"),
    ).toBeVisible();
    await page
      .getByLabel("Fully stocked photo")
      .setInputFiles(SHELF_IMAGES.full);
    await expect(page.getByText("sh-01-full.png")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove stocked photo" }),
    ).toBeVisible();
    await expect(save).toBeEnabled();
    // Without the stocked photo, saving is refused with a plain message.
    await page.getByRole("button", { name: "Remove stocked photo" }).click();
    await save.click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Choose a fully stocked photo",
    );
    await expect(page).toHaveURL(`/shelves/${id}/setup`);
    await page
      .getByLabel("Fully stocked photo")
      .setInputFiles(SHELF_IMAGES.full);
    await save.click();

    // Setup done: the app moves on to the stock check page.
    await expect(page).toHaveURL(`/shelves/${id}/check`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Check stock",
    );
    await expect(
      page.getByRole("img", { name: /Empty shelf baseline/ }),
    ).toBeVisible();

    // The shelf has left "Needs setup".
    await page.goto(`/shelves/${id}`);
    await expect(resultBadge(page)).toHaveText("Not checked yet");
    await page.goto("/");
    await expect(card.locator("[data-slot=badge]")).toHaveText(
      "Not checked yet",
    );
    // The summary has three tiles (Empty, Low, Full); there is no setup tile.
    const summary = page.getByRole("list", { name: "Stock summary" });
    await expect(summary.getByRole("link")).toHaveCount(3);
    await expect(
      summary.getByRole("link", { name: /Needs setup/ }),
    ).toHaveCount(0);
  });
});
