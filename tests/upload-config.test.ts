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
