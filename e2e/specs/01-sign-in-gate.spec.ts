import { test, expect } from "@playwright/test";
import { ENV, requiredEnv } from "../support/state";

// The gate is only active in hosted mode (VERCEL set). Global setup starts a
// second server in that mode with throwaway operator credentials.
const gateUrl = () => requiredEnv(ENV.gateUrl);
const username = () => requiredEnv(ENV.operatorUser);
const password = () => requiredEnv(ENV.operatorPassword);

test.describe("Sign-in gate", () => {
  test("refuses visitors who send no credentials", async ({
    browser,
    playwright,
  }) => {
    // The server answers 401 with a Basic challenge and no application content.
    const anonymous = await playwright.request.newContext({
      baseURL: gateUrl(),
    });
    const response = await anonymous.get("/");
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain("Basic");
    expect(await response.text()).toBe("Operator sign-in required.");
    await anonymous.dispose();

    // A real browser cannot get past the challenge without credentials.
    const context = await browser.newContext({ baseURL: gateUrl() });
    const page = await context.newPage();
    await expect(page.goto("/")).rejects.toThrow(
      /ERR_INVALID_AUTH_CREDENTIALS/,
    );
    await expect(page.getByRole("heading", { name: "Shelves" })).toHaveCount(0);
    await context.close();
  });

  test("keeps the API and photo storage closed too", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: gateUrl(),
    });
    for (const path of ["/api/health", "/api/shelves", "/media/x.png"]) {
      expect((await anonymous.get(path)).status(), path).toBe(401);
    }
    await anonymous.dispose();
  });

  test("refuses a wrong password", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: gateUrl(),
      httpCredentials: { username: username(), password: "not-the-password" },
    });
    const response = await (await context.newPage()).goto("/");
    expect(response?.status()).toBe(401);
    await context.close();
  });

  test("lets the operator in with the right credentials", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: gateUrl(),
      httpCredentials: { username: username(), password: password() },
    });
    const page = await context.newPage();
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Shelves" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    expect((await context.request.get("/api/health")).ok()).toBe(true);
    await context.close();
  });
});
