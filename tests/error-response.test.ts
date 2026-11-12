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
