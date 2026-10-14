import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
test("hosted access fails closed and requires operator credentials", () => {
  const saved = {
    vercel: process.env.VERCEL,
    user: process.env.OPERATOR_USERNAME,
    password: process.env.OPERATOR_PASSWORD,
  };
  try {
    process.env.VERCEL = "1";
    delete process.env.OPERATOR_USERNAME;
    delete process.env.OPERATOR_PASSWORD;
    assert.equal(proxy(new NextRequest("https://example.test")).status, 503);
    process.env.OPERATOR_USERNAME = "operator";
    process.env.OPERATOR_PASSWORD = "test-only-password";
    assert.equal(
      proxy(new NextRequest("https://example.test/api/health")).status,
      401,
    );
    assert.equal(
      proxy(
        new NextRequest("https://example.test/media/test.png", {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from("operator:test-only-password").toString("base64"),
          },
        }),
      ).status,
      200,
    );
  } finally {
    for (const [key, value] of Object.entries({
      VERCEL: saved.vercel,
      OPERATOR_USERNAME: saved.user,
      OPERATOR_PASSWORD: saved.password,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
