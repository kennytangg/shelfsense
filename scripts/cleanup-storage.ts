import { list, del } from "@vercel/blob";
import { pool, query } from "../src/server/database";
async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    throw Error("Blob storage is not configured");
  const referenced = new Set(
    (await query("SELECT storage_key FROM image_assets")).map(
      (a) => a.storage_key,
    ),
  );
  let cursor: string | undefined,
    found = 0;
  do {
    const page = await list({ cursor });
    for (const blob of page.blobs) {
      if (
        !/^(uploads|media)\//.test(blob.pathname) ||
        referenced.has(`blob:${blob.pathname}`) ||
        Date.now() - blob.uploadedAt.getTime() < 3600 * 1000
      )
        continue;
      found++;
      if (process.argv.includes("--apply")) await del(blob.pathname);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log(
    `${found} old unreferenced objects ${process.argv.includes("--apply") ? "removed" : "eligible (use --apply)"}.`,
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
