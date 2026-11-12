import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { ShelfApi, type ApiShelf } from "../support/api";
import { alertsBadge, checkStock, mainNavigation } from "../support/ui";
import { SHELF_IMAGES } from "../support/fixtures";

/**
 * Five shelves, one per state: Empty, Low, Full, Not checked yet (set up,
 * never checked) and Needs setup. Only Empty, Low and Full get summary tiles.
 */
test.describe("Dashboard", () => {
  test.describe.configure({ mode: "serial" });
  let api: ShelfApi;
  let empty: ApiShelf;
  let low: ApiShelf;

  const tile = (page: Page, label: string) =>
    page
      .getByRole("list", { name: "Stock summary" })
      .getByRole("link", { name: new RegExp(`${label}$`) });
  const cards = (page: Page) => page.getByRole("article");
  const cardNames = (page: Page) =>
    cards(page).getByRole("heading", { level: 2 });

  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    api = new ShelfApi(request);
    await api.removeAll();
    empty = await api.createCalibrated("Zebra snacks", "Front of store");
    low = await api.createCalibrated("Mango drinks", "Back wall");
    const full = await api.createCalibrated("Oat cereal", "Aisle 7");
    await api.createCalibrated("Tea bags", "Aisle 9");
    await api.create("Bread rack", "Bakery corner");
    await api.check(empty.id, "empty");
    await api.check(low.id, "low");
    await api.check(full.id, "full");
  });

  test("summary tiles match the shelves that exist", async ({ page }) => {
    await page.goto("/");
    const expected = { Empty: 1, Low: 1, Full: 1 };
    for (const [label, count] of Object.entries(expected)) {
      await expect(tile(page, label)).toHaveText(`${count}${label}`);
    }
    await expect(
      page.getByRole("list", { name: "Stock summary" }).getByRole("link"),
    ).toHaveCount(3);
    await expect(cards(page)).toHaveCount(5);
    // Under 8 shelves there is no search box, and no tabs or status dropdown.
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Shelf tasks" }),
    ).toHaveCount(0);
  });

  test("a card links to its shelf and has one action", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("article", { name: "Mango drinks" });
    await expect(
      card.getByRole("link", { name: "Mango drinks" }),
    ).toHaveAttribute("href", `/shelves/${low.id}`);
    await expect(card.getByRole("link", { name: "View shelf" })).toHaveCount(0);
    await expect(
      card.getByRole("link", { name: "Restock shelf" }),
    ).toBeVisible();
    // The sentence that restated the badge is gone.
    await expect(card.getByText("Stock is running low.")).toHaveCount(0);
    const never = page.getByRole("article", { name: "Tea bags" });
    await expect(never.locator("[data-slot=badge]")).toHaveText(
      "Not checked yet",
    );
  });

  test("most urgent shelf is listed first", async ({ page }) => {
    await page.goto("/");
    await expect(cardNames(page)).toHaveText([
      "Zebra snacks", // Empty
      "Mango drinks", // Low
      "Tea bags", // Not checked
      "Bread rack", // Needs setup
      "Oat cereal", // Full
    ]);
  });

  test("clicking a tile filters by that status, and again clears it", async ({
    page,
  }) => {
    await page.goto("/");
    await tile(page, "Low").click();
    await expect(page).toHaveURL(/status=Low/);
    await expect(cardNames(page)).toHaveText(["Mango drinks"]);
    await expect(tile(page, "Low")).toHaveAttribute("aria-current", "true");
    await tile(page, "Low").click();
    await expect(cards(page)).toHaveCount(5);
  });

  test("Alerts shows the attention view with a way back", async ({ page }) => {
    await page.goto("/");
    await mainNavigation(page)
      .getByRole("link", { name: /^Alerts/ })
      .click();
    await expect(page).toHaveURL(/view=attention/);
    await expect(cardNames(page)).toHaveText(["Zebra snacks", "Mango drinks"]);
    await page.getByRole("link", { name: "Back to all shelves" }).click();
    await expect(page).toHaveURL("/");
    await expect(cards(page)).toHaveCount(5);
  });

  test("Alerts badge counts shelves needing attention and updates on resolve", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(alertsBadge(page)).toHaveText(/^2/);
    await mainNavigation(page)
      .getByRole("link", { name: /^Alerts/ })
      .click();
    await expect(page).toHaveURL(/view=attention/);
    await expect(cardNames(page)).toHaveText(["Zebra snacks", "Mango drinks"]);

    // Staff report the Low shelf restocked: it still needs attention (verification).
    await page.goto(`/shelves/${low.id}`);
    await page
      .getByRole("button", { name: "Report restocked", exact: true })
      .click();
    await expect(
      page.getByText("Restock reported.", { exact: false }),
    ).toBeVisible();
    await expect(alertsBadge(page)).toHaveText(/^2/);
    await page.goto("/?view=attention");
    await expect(cardNames(page)).toHaveText(["Zebra snacks", "Mango drinks"]);
    await expect(
      page
        .getByRole("article", { name: "Mango drinks" })
        .getByText("Restock reported"),
    ).toBeVisible();

    // A Full photo resolves the task; the badge drops to the one empty shelf.
    await checkStock(page, low.id, SHELF_IMAGES.full);
    await expect(alertsBadge(page)).toHaveText(/^1/);
    await page.goto("/?view=attention");
    await expect(cardNames(page)).toHaveText(["Zebra snacks"]);
    await expect(tile(page, "Full")).toHaveText("2Full");
    await expect(tile(page, "Low")).toHaveText("0Low");

    // With the last task cleared the badge disappears.
    await checkStock(page, empty.id, SHELF_IMAGES.full);
    await expect(alertsBadge(page)).toHaveCount(0);
  });

  test("search appears at 8 shelves and finds by name and location", async ({
    page,
  }) => {
    const spares = [];
    for (const n of [1, 2, 3])
      spares.push(await api.create(`Spare ${n}`, "Storeroom"));
    await page.goto("/");
    const search = page.getByRole("searchbox", { name: "Search shelves" });
    await search.fill("mango");
    await expect(cardNames(page)).toHaveText(["Mango drinks"]);
    await search.fill("aisle");
    await expect(cardNames(page)).toHaveText(["Tea bags", "Oat cereal"]);
    await search.fill("bakery corner");
    await expect(cardNames(page)).toHaveText(["Bread rack"]);
    await search.fill("no such shelf");
    await expect(
      page.getByText("No shelves match the current filters."),
    ).toBeVisible();
    await search.fill("");
    await expect(cards(page)).toHaveCount(8);
    for (const spare of spares) await api.remove(spare.id);
  });
});
