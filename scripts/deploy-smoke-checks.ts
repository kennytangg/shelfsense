/** Read-only post-deploy checks. Pure logic; the fetch-like function is injected. */
export type Get = (path: string) => Promise<Response>;
export type CheckResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail: string;
};
export type Credentials = { username?: string; password?: string };
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const MISSING_MEDIA_PATH = "/media/00000000-0000-0000-0000-000000000000.png";
const PAGES = ["/", "/alerts", "/help"];

export function parseBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--url must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("--url must use http or https");
  if (url.username || url.password)
    throw new Error("--url must not contain credentials; use SMOKE_* env vars");
  return url;
}

/** GET-only helper; adds Basic auth when both credentials exist. */
export function authenticatedGet(
  base: string,
  fetcher: Fetcher,
  credentials: Credentials,
  timeoutMs: number,
): Get {
  const headers: Record<string, string> =
    credentials.username && credentials.password
      ? {
          Authorization:
            "Basic " +
            Buffer.from(
              `${credentials.username}:${credentials.password}`,
            ).toString("base64"),
        }
      : {};
  return (path) =>
    fetcher(new URL(path, base).toString(), {
      method: "GET",
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
}

const message = (e: unknown) =>
  e instanceof Error
    ? e.name === "TimeoutError"
      ? "timeout"
      : e.message
    : "failed";
const pass = (name: string, detail: string): CheckResult => ({
  name,
  ok: true,
  detail,
});
const fail = (name: string, detail: string): CheckResult => ({
  name,
  ok: false,
  detail,
});
const type = (r: Response) => r.headers.get("content-type") ?? "";

async function guarded(
  name: string,
  work: () => Promise<CheckResult>,
): Promise<CheckResult> {
  try {
    return await work();
  } catch (e) {
    return fail(name, `request failed: ${message(e)}`);
  }
}

async function readJson(r: Response): Promise<any> {
  try {
    return await r.json();
  } catch {
    return undefined;
  }
}

export async function checkHealth(get: Get): Promise<CheckResult> {
  const name = "health";
  return guarded(name, async () => {
    const r = await get("/api/health");
    const body = await readJson(r);
    if (
      r.status === 200 &&
      body?.api === "ready" &&
      body?.database === "ready" &&
      body?.schema === "ready"
    )
      return pass(name, "api, database and schema ready");
    if (body?.schema === "outdated") {
      const versions = Array.isArray(body.missing_migrations)
        ? body.missing_migrations.join(", ")
        : "unknown";
      return fail(
        name,
        `schema outdated, missing migrations: ${versions}; run npm run migrate against this database`,
      );
    }
    return fail(name, `HTTP ${r.status}, expected ready api/database/schema`);
  });
}

export async function checkShelves(
  get: Get,
): Promise<{ result: CheckResult; shelves?: any[] }> {
  const name = "shelves";
  try {
    const r = await get("/api/shelves");
    const body = await readJson(r);
    if (r.status === 200 && Array.isArray(body))
      return { result: pass(name, `${body.length} shelves`), shelves: body };
    return { result: fail(name, `HTTP ${r.status}, expected a JSON array`) };
  } catch (e) {
    return { result: fail(name, `request failed: ${message(e)}`) };
  }
}

export async function checkMediaRoute(get: Get): Promise<CheckResult> {
  const name = "media route";
  return guarded(name, async () => {
    const r = await get(MISSING_MEDIA_PATH);
    const body = type(r).includes("json") ? await readJson(r) : undefined;
    if (r.status === 404 && typeof body?.detail === "string")
      return pass(name, "unknown image answers JSON 404 from the app");
    if (type(r).includes("html"))
      return fail(
        name,
        `media route is not deployed: got HTML (HTTP ${r.status}) from the platform; check .vercelignore excludes`,
      );
    return fail(name, `HTTP ${r.status}, expected JSON 404 from the app`);
  });
}

export async function checkReferenceImage(
  get: Get,
  shelves: any[] | undefined,
  shelvesError?: string,
): Promise<CheckResult> {
  const name = "reference image";
  if (!shelves)
    return fail(name, `not run: ${shelvesError ?? "no shelf list"}`);
  const url = shelves.find((s) => typeof s?.reference?.url === "string")
    ?.reference.url;
  if (!url)
    return {
      ...pass(name, "no shelf has a reference image"),
      skipped: true,
    };
  return guarded(name, async () => {
    const r = await get(url);
    const bytes = r.status === 200 ? (await r.arrayBuffer()).byteLength : 0;
    if (r.status === 200 && type(r).startsWith("image/") && bytes > 0)
      return pass(name, `${url} ${type(r)} ${bytes} bytes`);
    return fail(
      name,
      `${url} HTTP ${r.status}, ${type(r) || "no content type"}, ${bytes} bytes`,
    );
  });
}

export async function checkPage(get: Get, path: string): Promise<CheckResult> {
  const name = `page ${path}`;
  return guarded(name, async () => {
    const r = await get(path);
    await r.arrayBuffer();
    if (r.status === 200 && type(r).includes("text/html"))
      return pass(name, "200 HTML");
    return fail(name, `HTTP ${r.status}, ${type(r) || "no content type"}`);
  });
}

export async function runChecks(get: Get): Promise<CheckResult[]> {
  const health = await checkHealth(get);
  const { result: shelvesResult, shelves } = await checkShelves(get);
  const media = await checkMediaRoute(get);
  const reference = await checkReferenceImage(
    get,
    shelves,
    shelvesResult.detail,
  );
  const pages = [];
  for (const path of PAGES) pages.push(await checkPage(get, path));
  return [health, shelvesResult, media, reference, ...pages];
}

export const formatResult = (r: CheckResult) =>
  `${r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL"} ${r.name}: ${r.detail}`;
