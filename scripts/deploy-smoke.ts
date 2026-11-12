import { parseArgs } from "node:util";
import {
  authenticatedGet,
  formatResult,
  parseBaseUrl,
  runChecks,
} from "./deploy-smoke-checks";

const TIMEOUT_MS = 15000;

async function main() {
  const { values } = parseArgs({ options: { url: { type: "string" } } });
  if (!values.url)
    throw new Error("Usage: npm run smoke -- --url https://host");
  const base = parseBaseUrl(values.url);
  const get = authenticatedGet(
    base.toString(),
    fetch,
    {
      username: process.env.SMOKE_USERNAME,
      password: process.env.SMOKE_PASSWORD,
    },
    TIMEOUT_MS,
  );
  const results = await runChecks(get);
  for (const result of results) console.log(formatResult(result));
  const failures = results.filter((r) => !r.ok).length;
  console.log(
    failures
      ? `${failures} of ${results.length} checks FAILED`
      : `All ${results.length} checks passed`,
  );
  process.exitCode = failures ? 1 : 0;
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Smoke check failed");
  process.exitCode = 1;
});
