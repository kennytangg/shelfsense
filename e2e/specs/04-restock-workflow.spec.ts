import { test, expect } from "../support/test";
import { SHELF_IMAGES } from "../support/fixtures";
import { ShelfApi } from "../support/api";
import { checkStock, resultBadge } from "../support/ui";

test.describe("Restock workflow", () => {
  test("report restocked waits for a Full photo before the task is resolved", async ({
    page,
    request,
  }) => {
    const api = new ShelfApi(request);
    const shelf = await api.createCalibrated("Restock shelf", "Aisle 3");
    await api.check(shelf.id, "low");
    const [task] = await api.alertsFor(shelf.id);
    expect(task.state).toBe("Open");
    expect((await api.get(shelf.id)).awaiting_verification).toBe(false);

    await page.goto(`/shelves/${shelf.id}`);
    await expect(resultBadge(page)).toHaveText("Low");
    await page
      .getByRole("button", { name: "Report restocked", exact: true })
      .click();

    // Task is now awaiting verification; the measured stock is untouched.
    await expect(
      page.getByText(
        "Restock reported. Check stock with a new photo to update the result.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Report restocked", exact: true }),
    ).toHaveCount(0);
    await expect(resultBadge(page)).toHaveText("Low");
    const [reported] = await api.alertsFor(shelf.id);
    expect(reported.id).toBe(task.id);
    // The app closes the task as "staff reported restocked" and flags the
    // shelf as awaiting verification until the next valid photo.
    expect(reported.state).toBe("Resolved");
    expect(reported.resolution_reason).toBe("Staff reported restocked");
    expect((await api.get(shelf.id)).awaiting_verification).toBe(true);

    // The dashboard still shows Low, with a Restock reported note, and it
    // stays in the Alerts (attention) view.
    await page.goto("/?view=attention");
    const card = page.getByRole("article", { name: "Restock shelf" });
    await expect(card.locator("[data-slot=badge]")).toHaveText("Low");
    await expect(
      card.getByText("Restock reported · Confirm the refill with a new photo."),
    ).toBeVisible();
    await card.getByRole("link", { name: "Verify restock" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Check stock",
    );

    // A fresh Full photo verifies the refill and resolves the task.
    await page.getByLabel("Shelf photo").setInputFiles(SHELF_IMAGES.full);
    await page
      .getByRole("button", { name: "Check stock", exact: true })
      .click();
    await expect(page).toHaveURL(`/shelves/${shelf.id}`);
    await expect(resultBadge(page)).toHaveText("Full");
    await expect(page.getByText("This shelf needs restocking.")).toHaveCount(0);
    await expect(
      page.getByText("Restock reported.", { exact: false }),
    ).toHaveCount(0);
    const [resolved] = await api.alertsFor(shelf.id);
    expect(resolved.id).toBe(task.id);
    expect(resolved.state).toBe("Resolved");
    expect(await api.alertsFor(shelf.id)).toHaveLength(1);
    expect((await api.get(shelf.id)).awaiting_verification).toBe(false);
  });

  test("a still-Low photo after reporting opens a fresh task", async ({
    page,
    request,
  }) => {
    const api = new ShelfApi(request);
    const shelf = await api.createCalibrated("Still low shelf", "Aisle 3");
    await api.check(shelf.id, "low");
    const [first] = await api.alertsFor(shelf.id);
    await request.patch(`/api/alerts/${first.id}`, {
      data: { action: "report_restocked" },
    });
    expect((await api.get(shelf.id)).awaiting_verification).toBe(true);

    await checkStock(page, shelf.id, SHELF_IMAGES.low);
    await expect(resultBadge(page)).toHaveText("Low");
    // Not verified: the shelf is back to "needs restocking" with one open task.
    await expect(page.getByText("This shelf needs restocking.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Report restocked", exact: true }),
    ).toBeVisible();
    const tasks = await api.alertsFor(shelf.id);
    expect(tasks.filter((task) => task.state === "Open")).toHaveLength(1);
    expect((await api.get(shelf.id)).awaiting_verification).toBe(false);
  });
});
