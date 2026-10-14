import { test } from "node:test";
import assert from "node:assert/strict";
import { withImageProcessing } from "../src/server/image-queue";
test("image queue serializes work and rejects excess requests without losing the lock", async () => {
  let release: () => void = () => {},
    running = 0,
    peak = 0;
  const gate = new Promise<void>((done) => (release = done));
  const first = withImageProcessing(async () => {
    running++;
    peak = Math.max(peak, running);
    await gate;
    running--;
    return 0;
  });
  const queued = Array.from({ length: 8 }, (_, index) =>
    withImageProcessing(async () => {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
      return index + 1;
    }),
  );
  await assert.rejects(
    withImageProcessing(async () => 9),
    { status: 503 },
  );
  release();
  assert.deepEqual(
    await Promise.all([first, ...queued]),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(peak, 1);
  await assert.rejects(
    withImageProcessing(async () => {
      throw Error("failed");
    }),
  );
  assert.equal(await withImageProcessing(async () => true), true);
});
