import { expect, type Locator, type Page } from "@playwright/test";
import { FIXTURE_ROI } from "./fixtures";

export const shelfIdFromUrl = (page: Page): string =>
  new URL(page.url()).pathname.split("/")[2];

/** The stock badge inside the "Latest result" card of a shelf page. */
export function resultBadge(page: Page): Locator {
  return page
    .getByRole("region")
    .filter({
      has: page.getByRole("heading", {
        name: /Latest result|Previous valid result|No valid result/,
      }),
    })
    .locator("[data-slot=badge]");
}

export const checkHistory = (page: Page): Locator =>
  page.getByRole("region", { name: "Check history" });

export const mainNavigation = (page: Page): Locator =>
  page.getByRole("navigation", { name: "Main navigation" });

export const alertsBadge = (page: Page): Locator =>
  mainNavigation(page)
    .getByRole("link", { name: /^Alerts/ })
    .locator("span.tabular-nums");

/** Add a shelf through the form; ends on the setup page. */
export async function addShelfViaForm(
  page: Page,
  name: string,
  location: string,
) {
  await page.goto("/shelves/new");
  await page.getByLabel("Shelf name").fill(name);
  await page.getByLabel("Location", { exact: true }).fill(location);
  await page.getByRole("button", { name: "Add shelf", exact: true }).click();
  await expect(page).toHaveURL(/\/shelves\/[^/]+\/setup$/);
}

/**
 * Narrow the selection from the whole image to FIXTURE_ROI with the keyboard
 * (arrow keys move, Shift+arrow resizes; each press is 1% of the image).
 */
export async function selectFixtureArea(page: Page) {
  await page.getByRole("button", { name: "Use entire image" }).click();
  await page.getByRole("group", { name: /Shelf area selection/ }).focus();
  const widthSteps = Math.round((1 - FIXTURE_ROI.width) * 100);
  const heightSteps = Math.round((1 - FIXTURE_ROI.height) * 100);
  for (let n = 0; n < widthSteps; n++)
    await page.keyboard.press("Shift+ArrowLeft");
  for (let n = 0; n < heightSteps; n++)
    await page.keyboard.press("Shift+ArrowUp");
  for (let n = 0; n < Math.round(FIXTURE_ROI.x * 100); n++)
    await page.keyboard.press("ArrowRight");
  for (let n = 0; n < Math.round(FIXTURE_ROI.y * 100); n++)
    await page.keyboard.press("ArrowDown");
}

/** Upload a photo on the check page and submit it. Does not wait for the outcome. */
export async function submitCheck(
  page: Page,
  id: string,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto(`/shelves/${id}/check`);
  await page.getByLabel("Shelf photo").setInputFiles(file);
  await page.getByRole("button", { name: "Check stock", exact: true }).click();
}

/** Submit a photo that should be accepted and wait for the shelf page. */
export async function checkStock(page: Page, id: string, file: string) {
  await submitCheck(page, id, file);
  await expect(page).toHaveURL(new RegExp(`/shelves/${id}$`));
}

/**
 * Drag the monitored area with the mouse so it covers `area` (fractions of the
 * image). Starts from the current preview image, so call it after the
 * reference photo has been chosen.
 */
export async function dragMonitoredArea(
  page: Page,
  area: { x: number; y: number; width: number; height: number },
) {
  const image = page.getByRole("img", {
    name: "Setup reference; draw the measurement region",
  });
  await expect(image).toBeVisible();
  const box = await image.boundingBox();
  if (!box) throw new Error("The reference preview has no size.");
  const at = (fx: number, fy: number) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  });
  const start = at(area.x, area.y);
  const end = at(area.x + area.width, area.y + area.height);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2, {
    steps: 5,
  });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}
