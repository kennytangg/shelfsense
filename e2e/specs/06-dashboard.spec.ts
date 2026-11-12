import type { Page } from "@playwright/test";
import { test, expect } from "../support/test";
import { ShelfApi, type ApiShelf } from "../support/api";
import { alertsBadge, checkStock, mainNavigation } from "../support/ui";
import { SHELF_IMAGES } from "../support/fixtures";

/**
 * Five shelves, one per stock state:
 * Empty, Low, Full, Not checked (set up, never checked), Needs setup.
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
  const tab = (page: Page, label: string) =>
    page
      .getByRole("navigation", { name: "Shelf tasks" })
      .getByRole("link", { name: new RegExp(`^${label}`) });
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
    const expected = {
      Empty: 1,
      Low: 1,
      Full: 1,
      "Not checked": 1,
      "Needs setup": 1,
    };
    for (const [label, count] of Object.entries(expected)) {
      await expect(tile(page, label)).toHaveText(`${count}${label}`);
    }
    await expect(cards(page)).toHaveCount(5);
    await expect(tab(page, "All")).toContainText("(5)");
    await expect(tab(page, "Needs attention")).toContainText("(2)");
    await expect(tab(page, "Needs restocking")).toContainText("(2)");
    await expect(tab(page, "Restock reported")).toContainText("(0)");
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

  test("tabs filter by task", async ({ page }) => {
    await page.goto("/");
    await tab(page, "Needs restocking").click();
    await expect(page).toHaveURL(/view=restocking/);
    await expect(cardNames(page)).toHaveText(["Zebra snacks", "Mango drinks"]);
    await tab(page, "Restock reported").click();
    await expect(
      page.getByText("No shelves match the current filters."),
    ).toBeVisible();
    await tab(page, "All").click();
    await expect(cards(page)).toHaveCount(5);
  });

  test("search finds shelves by name and by location", async ({ page }) => {
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
    await expect(cards(page)).toHaveCount(5);
  });

  test("status dropdown filters", async ({ page }) => {
    await page.goto("/");
    const select = page.getByRole("combobox", {
      name: "Filter by stock status",
    });
    await select.selectOption("Full");
    await expect(page).toHaveURL(/status=Full/);
    await expect(cardNames(page)).toHaveText(["Oat cereal"]);
    await select.selectOption("Needs setup");
    await expect(cardNames(page)).toHaveText(["Bread rack"]);
    await select.selectOption("");
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
    await page.goto("/");
    await expect(tab(page, "Needs restocking")).toContainText("(1)");
    await expect(tab(page, "Restock reported")).toContainText("(1)");

    // A Full photo resolves the task; the badge drops to the one empty shelf.
    await checkStock(page, low.id, SHELF_IMAGES.full);
    await expect(alertsBadge(page)).toHaveText(/^1/);
    await page.goto("/");
    await expect(tab(page, "Needs attention")).toContainText("(1)");
    await expect(tab(page, "Restock reported")).toContainText("(0)");
    await expect(tile(page, "Full")).toHaveText("2Full");
    await expect(tile(page, "Low")).toHaveText("0Low");

    // With the last task cleared the badge disappears.
    await checkStock(page, empty.id, SHELF_IMAGES.full);
    await expect(alertsBadge(page)).toHaveCount(0);
  });
});
