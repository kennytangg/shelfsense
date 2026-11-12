import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "../support/test";
import {
  addShelfViaForm,
  alertsBadge,
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

  test("default whole-image area (no dragging): empty, half, full, mostly full", async ({
    page,
  }) => {
    // Exactly what a first-time owner does: pick the two photos and save, leaving
    // the monitored area at its default (the whole image).
    await addShelfViaForm(page, "Real bookshelf default area", "Study wall");
    const id = shelfIdFromUrl(page);
    await page
      .getByLabel("Shelf photo")
      .setInputFiles(photo("01-empty-reference.jpg"));
    await page
      .getByLabel("Fully stocked photo")
      .setInputFiles(photo("04-full.jpg"));
    await page.getByRole("button", { name: "Save setup", exact: true }).click();
    await expect(page).toHaveURL(`/shelves/${id}/check`);

    for (const [file, expected] of [
      ["02-empty-again.jpg", "Empty"],
      ["03-half.jpg", "Low"],
      ["05-full-again.jpg", "Full"],
      ["07-mostly-full.jpg", "Full"],
    ] as const) {
      await submitCheck(page, id, photo(file));
      await expect(page).toHaveURL(
        new RegExp(`/shelves/${id}(\\?duplicate=1)?$`),
      );
      await expect(resultBadge(page), file).toHaveText(expected);
    }
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

type Journey = {
  set: string;
  reference: string;
  stocked: string;
  full: string;
  low: string;
  fullAgain: string;
  lowAgain: string;
  empty?: string;
};
// Distinct files are used where a set has them; local uploads are not deduplicated anyway.
const JOURNEYS: readonly Journey[] = [
  {
    set: "real-bookshelf",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    full: "05-full-again.jpg",
    low: "03-half.jpg",
    fullAgain: "07-mostly-full.jpg",
    lowAgain: "03-half.jpg",
    empty: "02-empty-again.jpg",
  },
  {
    set: "fridge",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    full: "05-full-again.jpg",
    low: "03-low.jpg",
    fullAgain: "06-mostly-full.jpg",
    lowAgain: "07-low-2.jpg",
    empty: "02-empty-again.jpg",
  },
  {
    set: "pantry",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    full: "05-full-again.jpg",
    low: "03-low.jpg",
    fullAgain: "04-full.jpg",
    lowAgain: "07-low-2.jpg",
  },
  {
    set: "shoebox-stop-motion",
    reference: "01-empty-reference.jpg",
    stocked: "04-full.jpg",
    full: "05-full-again.jpg",
    low: "03-low.jpg",
    fullAgain: "06-mostly-full.jpg",
    lowAgain: "07-low-2.jpg",
    empty: "02-empty-again.jpg",
  },
];

for (const j of JOURNEYS) {
  const dir = resolve(SAMPLES, "..", j.set);
  const file = (name: string) => resolve(dir, name);
  test.describe(`Check, restock, recheck loop: ${j.set} (local only)`, () => {
    test.skip(
      !existsSync(dir),
      `local-samples/${j.set}/ is not present (private photos, never committed)`,
    );

    test("default area: full, low, report restocked, full, low again, empty", async ({
      page,
    }) => {
      await addShelfViaForm(page, `Journey ${j.set}`, "Local samples");
      const id = shelfIdFromUrl(page);
      await page.getByLabel("Shelf photo").setInputFiles(file(j.reference));
      await page
        .getByLabel("Fully stocked photo")
        .setInputFiles(file(j.stocked));
      await page
        .getByRole("button", { name: "Save setup", exact: true })
        .click();
      await expect(page).toHaveURL(`/shelves/${id}/check`);

      const needsRestock = page.getByText("This shelf needs restocking.");
      const reportButton = page.getByRole("button", {
        name: "Report restocked",
        exact: true,
      });
      // Other specs may leave alerts on other shelves, so compare to a baseline.
      const badgeCount = async () => {
        const badge = alertsBadge(page);
        return (await badge.count()) === 0
          ? 0
          : Number.parseInt((await badge.innerText()).trim(), 10);
      };
      const check = async (name: string, status: string) => {
        await submitCheck(page, id, file(name));
        await expect(page).toHaveURL(new RegExp(`/shelves/${id}(\\?.*)?$`));
        await expect(resultBadge(page), name).toHaveText(status);
      };

      await check(j.full, "Full");
      await expect(needsRestock).toHaveCount(0);
      const baseline = await badgeCount();

      await check(j.low, "Low");
      await expect(needsRestock).toBeVisible();
      await expect.poll(badgeCount).toBe(baseline + 1);
      await page.goto("/?view=attention");
      await expect(
        page.getByRole("article", { name: `Journey ${j.set}` }),
      ).toBeVisible();
      await page.goto(`/shelves/${id}`);
      await expect(
        page.getByRole("link", { name: "Check stock", exact: true }),
      ).toBeVisible();

      await reportButton.click();
      await expect(page.getByText(/^Restock reported\./)).toBeVisible();
      await expect(resultBadge(page)).toHaveText("Low");
      await expect(reportButton).toHaveCount(0);

      await check(j.fullAgain, "Full");
      await expect(needsRestock).toHaveCount(0);
      await expect(page.getByText(/^Restock reported\./)).toHaveCount(0);
      await expect.poll(badgeCount).toBe(baseline);

      // A new Low photo opens a fresh task (the reported one was closed).
      await check(j.lowAgain, "Low");
      await expect(needsRestock).toBeVisible();
      await expect(reportButton).toBeVisible();
      await expect.poll(badgeCount).toBe(baseline + 1);

      if (j.empty) await check(j.empty, "Empty");
    });
  });
}
