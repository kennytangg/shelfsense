import { test as base, expect } from "@playwright/test";
import { ENV, requiredEnv } from "./state";

/** Playwright test whose baseURL points at the server started by global setup. */
export const test = base.extend({
  baseURL: async ({}, use) => {
    await use(requiredEnv(ENV.baseUrl));
  },
});
export { expect };
