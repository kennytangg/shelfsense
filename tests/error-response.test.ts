import { test } from "node:test";
import assert from "node:assert/strict";
import { errorResponse } from "../src/server/http";

const dbError = (code: string, constraint?: string) =>
  Object.assign(new Error("db"), { code, constraint });

test("outdated analyses check constraint reports a migration problem", async () => {
  const response = errorResponse(dbError("23514", "analyses_check"));
  assert.equal(response.status, 503);
  assert.match((await response.json()).detail, /npm run migrate/);
});

test("other constraint violations remain conflicts", async () => {
  const response = errorResponse(
    dbError("23505", "one_active_alert_per_shelf"),
  );
  assert.equal(response.status, 409);
});

test("database connection failures map to a retryable 503 JSON response", async () => {
  const cases = [
    new Error("timeout exceeded when trying to connect"),
    Object.assign(new Error("Failed query"), {
      cause: new Error("Connection terminated unexpectedly"),
    }),
    Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }),
    }),
  ];
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const error of cases) {
      const response = errorResponse(error);
      assert.equal(response.status, 503);
      assert.match((await response.json()).detail, /unavailable/);
    }
    assert.equal(errorResponse(new Error("boom")).status, 500);
  } finally {
    console.error = quiet;
  }
});
