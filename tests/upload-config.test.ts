import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadTicket } from "../src/server/upload-tickets";

test("hosted uploads reject missing Blob configuration before offering local uploads", async () => {
  const saved = {
    VERCEL: process.env.VERCEL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  };
  try {
    process.env.VERCEL = "1";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await assert.rejects(uploadTicket("unused-shelf", "analyses"), {
      status: 503,
      message:
        "Image uploads are not configured. Connect a private Blob store and set BLOB_READ_WRITE_TOKEN for this deployment, then redeploy.",
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("direct-upload tokens allow the SDK's lost-response retry to rewrite the single-use ticket path", async () => {
  const { uploadTokenOptions } = await import("../src/server/upload-tickets");
  const { ASSET_PUT_OPTIONS } = await import("../src/server/storage");
  // Regression: allowOverwrite false made a retried put fail with
  // "This blob already exists" after ~20 s although the first attempt stored it.
  assert.equal(typeof uploadTokenOptions, "function");
  assert.equal(ASSET_PUT_OPTIONS.allowOverwrite, true);
  assert.equal(ASSET_PUT_OPTIONS.addRandomSuffix, false);
});

test("temporary upload blobs are removed after handling, including the stocked photo", async () => {
  const { releaseTempUploads } = await import("../src/server/http");
  const removed: string[] = [];
  const fake = (name: string) => ({
    remove: async () => {
      removed.push(name);
    },
  });
  let scheduled: (() => Promise<void>) | undefined;
  releaseTempUploads({ ...fake("main"), stocked: fake("stocked") }, (work) => {
    scheduled = work;
  });
  assert.deepEqual(
    removed,
    [],
    "deletion is deferred until after the response",
  );
  await scheduled!();
  assert.deepEqual(removed.sort(), ["main", "stocked"]);
  // A failing delete must never throw into the request path.
  releaseTempUploads(
    {
      remove: async () => {
        throw new Error("blob down");
      },
    },
    (work) => void work(),
  );
});
