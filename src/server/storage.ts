import "server-only";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { put, del, get } from "@vercel/blob";
import { png, type RGB } from "./shelf-analysis";
import { HttpError } from "./validation";
import { timed } from "./timing";
/**
 * The key is a fresh random UUID per call, so only a retry of this same put can
 * hit it; allowing overwrite makes the SDK's internal retry idempotent instead
 * of failing with "blob already exists". Historical assets are never reused.
 */
export const ASSET_PUT_OPTIONS = {
  access: "private",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "image/png",
} as const;
export const mediaRoot = () => resolve(process.env.MEDIA_DIR || "media");
function localKey(key: string) {
  if (!/^[0-9a-f-]{36}\.png$/.test(key))
    throw new HttpError(404, "Image not found.");
  return resolve(mediaRoot(), key);
}
export async function readImage(key: string) {
  if (key.startsWith("blob:")) {
    return timed("blob-get", async () => {
      const result = await get(key.slice(5), { access: "private" });
      if (!result) throw new HttpError(404, "Image not found.");
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    });
  }
  return readFile(localKey(key));
}
export async function removeImage(key: string) {
  if (key.startsWith("blob:")) await del(key.slice(5));
  else
    await unlink(localKey(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
}
export async function writeAsset(
  shelfId: string,
  image: RGB,
  role: string,
  demo: boolean,
  created: string[],
  id: string = randomUUID(),
) {
  const bytes = await timed("png-encode", () => png(image)),
    key = `${randomUUID()}.png`;
  let storageKey = key;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const result = await timed("blob-put", () =>
      put(`media/${key}`, bytes, { ...ASSET_PUT_OPTIONS }),
    );
    storageKey = `blob:${result.pathname}`;
  } else {
    if (process.env.VERCEL)
      throw new Error("Blob storage is required on Vercel");
    await mkdir(mediaRoot(), { recursive: true });
    await writeFile(localKey(key), bytes, { flag: "wx" });
  }
  created.push(storageKey);
  return {
    id,
    shelf_id: shelfId,
    storage_key: storageKey,
    mime_type: "image/png",
    width: image.width,
    height: image.height,
    file_size: bytes.length,
    role,
    demo,
    created_at: new Date(),
  };
}
export async function cleanup(keys: string[]) {
  await timed("blob-cleanup", () => Promise.all(keys.map(removeImage)));
}

export async function imageStream(
  key: string,
): Promise<ReadableStream<Uint8Array>> {
  if (key.startsWith("blob:")) {
    const result = await get(key.slice(5), { access: "private" });
    if (!result?.stream) throw new HttpError(404, "Image not found.");
    return result.stream;
  }
  return Readable.toWeb(
    createReadStream(localKey(key)),
  ) as ReadableStream<Uint8Array>;
}
