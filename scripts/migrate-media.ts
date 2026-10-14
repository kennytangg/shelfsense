import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { pool, query, transaction } from "../src/server/database";
import { readImage, removeImage } from "../src/server/storage";
async function main() {
  const assets = await query("SELECT * FROM image_assets ORDER BY id");
  let verified = 0,
    copied = 0;
  const apply = process.argv.includes("--apply");
  if (apply && !process.env.BLOB_READ_WRITE_TOKEN)
    throw Error("BLOB_READ_WRITE_TOKEN is required for --apply");
  const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  for (const a of assets) {
    const bytes = await readImage(a.storage_key);
    if (bytes.length !== a.file_size)
      throw Error(`Stored size differs for asset ${a.id}`);
    verified++;
    if (!apply || a.storage_key.startsWith("blob:")) continue;
    const blob = await put(`media/${a.storage_key}`, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: a.mime_type,
    });
    const key = `blob:${blob.pathname}`;
    try {
      if (hash(await readImage(key)) !== hash(bytes))
        throw Error(`Hash mismatch for ${a.id}`);
      await transaction(async (c) => {
        const current = (
          await query(
            "SELECT storage_key FROM image_assets WHERE id=$1 FOR UPDATE",
            [a.id],
            c,
          )
        )[0];
        if (current.storage_key !== a.storage_key)
          throw Error("Asset changed during media copy");
        await query(
          "UPDATE image_assets SET storage_key=$1 WHERE id=$2",
          [key, a.id],
          c,
        );
      });
      copied++;
    } catch (e) {
      await removeImage(key);
      throw e;
    }
  }
  console.log(
    `Verified ${verified} image byte counts/hashes; copied ${copied} to private Blob. Local rollback files retained.`,
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
