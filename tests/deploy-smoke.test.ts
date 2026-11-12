import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBaseUrl,
  runChecks,
  authenticatedGet,
  formatResult,
  type Get,
} from "../scripts/deploy-smoke-checks";

const SECRET = "s3cret-pass-value";
const json = (body: unknown, status = 200) => Response.json(body, { status });
const html = (status = 200) =>
  new Response("<!doctype html><title>x</title>", {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
const png = () =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { "Content-Type": "image/png" },
  });
const MISSING = "/media/00000000-0000-0000-0000-000000000000.png";
const shelf = { id: "a", reference: { url: "/media/abc.png" } };

function stub(overrides: Record<string, () => Response> = {}): Get {
  const routes: Record<string, () => Response> = {
    "/api/health": () =>
      json({ api: "ready", database: "ready", schema: "ready" }),
    "/api/shelves": () => json([shelf]),
    [MISSING]: () => json({ detail: "Image not found." }, 404),
    "/media/abc.png": png,
    "/": () => html(),
    "/alerts": () => html(),
    "/help": () => html(),
    ...overrides,
  };
  return async (path) => {
    const route = routes[path];
    if (!route) throw new Error("unexpected path " + path);
    return route();
  };
}
const failed = (results: Awaited<ReturnType<typeof runChecks>>) =>
  results.filter((r) => !r.ok);

test("all healthy deployment passes every check", async () => {
  const results = await runChecks(stub());
  assert.equal(results.length, 7);
  assert.deepEqual(failed(results), []);
});

test("outdated schema fails and shows missing versions", async () => {
  const results = await runChecks(
    stub({
      "/api/health": () =>
        json(
          {
            api: "ready",
            database: "ready",
            schema: "outdated",
            missing_migrations: ["0002"],
          },
          503,
        ),
    }),
  );
  const [bad] = failed(results);
  assert.match(bad.detail, /0002/);
  assert.match(bad.detail, /npm run migrate/);
});

test("HTML 404 on the media probe names a missing route", async () => {
  const [bad] = failed(await runChecks(stub({ [MISSING]: () => html(404) })));
  assert.match(bad.name, /media/i);
  assert.match(bad.detail, /media route is not deployed/i);
});

test("reference image 404 fails", async () => {
  const [bad] = failed(
    await runChecks(
      stub({ "/media/abc.png": () => json({ detail: "x" }, 404) }),
    ),
  );
  assert.match(bad.name, /reference image/i);
  assert.match(bad.detail, /404/);
});

test("no reference image is reported as skipped, not failed", async () => {
  const results = await runChecks(
    stub({ "/api/shelves": () => json([{ id: "a", reference: null }]) }),
  );
  assert.deepEqual(failed(results), []);
  assert.match(formatResult(results[3]), /^SKIP /);
});

test("page returning an HTML-less response fails", async () => {
  const [bad] = failed(await runChecks(stub({ "/help": () => json({}, 200) })));
  assert.match(bad.name, /\/help/);
});

test("request errors become failures instead of throwing", async () => {
  const get: Get = async () => {
    throw new Error("timeout");
  };
  const results = await runChecks(get);
  assert.ok(results.length >= 1);
  assert.ok(results.every((r) => !r.ok && /timeout/.test(r.detail)));
});

test("credentials are sent as Basic auth but never appear in output", async () => {
  const seen: (string | null)[] = [];
  const fetcher = async (_url: string, init?: RequestInit) => {
    seen.push(new Headers(init?.headers).get("authorization"));
    return new Response("Operator sign-in required.", { status: 401 });
  };
  const get = authenticatedGet(
    "https://example.test",
    fetcher,
    { username: "operator", password: SECRET },
    1000,
  );
  const output = (await runChecks(get)).map(formatResult).join("\n");
  assert.equal(
    seen[0],
    "Basic " + Buffer.from(`operator:${SECRET}`).toString("base64"),
  );
  assert.ok(!output.includes(SECRET));
  assert.ok(
    !output.includes(Buffer.from(`operator:${SECRET}`).toString("base64")),
  );
});

test("no Authorization header without both credentials", async () => {
  const seen: (string | null)[] = [];
  const get = authenticatedGet(
    "https://example.test",
    async (_u, init) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      return json([]);
    },
    { username: "operator" },
    1000,
  );
  await get("/api/shelves");
  assert.deepEqual(seen, [null]);
});

test("only http and https URLs without embedded credentials are accepted", () => {
  assert.equal(parseBaseUrl("https://a.example/").href, "https://a.example/");
  assert.throws(() => parseBaseUrl("ftp://a.example"), /http/);
  assert.throws(() => parseBaseUrl("file:///etc/passwd"), /http/);
  assert.throws(() => parseBaseUrl("nonsense"), /valid URL/);
  assert.throws(() => parseBaseUrl("https://u:p@a.example"), /credentials/);
});
