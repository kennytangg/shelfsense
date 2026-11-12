import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_MIGRATION_VERSIONS,
  missingMigrations,
} from "../src/server/migration-versions";

test("expected migration versions are ordered and include 0002", () => {
  assert.deepEqual(
    [...EXPECTED_MIGRATION_VERSIONS],
    [...EXPECTED_MIGRATION_VERSIONS].sort(),
  );
  assert.ok(EXPECTED_MIGRATION_VERSIONS.includes("0002"));
});

test("missingMigrations lists unrecorded versions without mutating inputs", () => {
  const recorded = ["0001"];
  assert.deepEqual(missingMigrations(recorded, ["0001", "0002"]), ["0002"]);
  assert.deepEqual(recorded, ["0001"]);
  assert.deepEqual(missingMigrations(["0001", "0002"], ["0001", "0002"]), []);
  assert.deepEqual(missingMigrations([], ["0001", "0002"]), ["0001", "0002"]);
});
