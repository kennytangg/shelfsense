import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { get, del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getShelf } from "./shelves";
import { MAX_BYTES } from "./shelf-analysis";
import { HttpError } from "./validation";
type Ticket = {
  shelf: string;
  operation: string;
  path: string;
  expires: number;
  version: number;
};
const secret = () => {
  const s = process.env.UPLOAD_SIGNING_SECRET;
  if (!s) throw new HttpError(503, "Upload signing is not configured.");
  return s;
};
function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}
export function verifyTicket(token: string): Ticket {
  const [payload, signature] = token.split(".");
  if (!payload || !signature)
    throw new HttpError(422, "Invalid upload ticket.");
  const expected = Buffer.from(sign(payload)),
    actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new HttpError(422, "Invalid upload ticket.");
  const t = JSON.parse(Buffer.from(payload, "base64url").toString()) as Ticket;
  if (t.expires < Date.now())
    throw new HttpError(422, "Upload expired. Choose the image again.");
  return t;
}
export async function uploadTicket(shelf: string, operation: string) {
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN)
    throw new HttpError(
      503,
      "Image uploads are not configured. Connect a private Blob store and set BLOB_READ_WRITE_TOKEN for this deployment, then redeploy.",
    );
  const snapshot = await getShelf(shelf);
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return { storage: "local", ticket: "", pathname: "" };
  if (!["analyses", "calibration", "placement"].includes(operation))
    throw new HttpError(422, "Invalid upload operation.");
  const path = `uploads/${shelf}/${randomUUID()}`,
    payload = Buffer.from(
      JSON.stringify({
        shelf,
        version: snapshot.calibration_version,
        operation,
        path,
        expires: Date.now() + 15 * 60 * 1000,
      }),
    ).toString("base64url");
  return {
    ticket: `${payload}.${sign(payload)}`,
    pathname: path,
    storage: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local",
  };
}
export async function blobUpload(request: Request, body: HandleUploadBody) {
  return handleUpload({
    request,
    body,
    onBeforeGenerateToken: async (pathname, payload) => {
      const t = verifyTicket(payload ?? "");
      await getShelf(t.shelf);
      if (pathname !== t.path)
        throw new HttpError(422, "Upload does not belong to this shelf.");
      return {
        allowedContentTypes: ["image/png", "image/jpeg"],
        maximumSizeInBytes: MAX_BYTES,
        validUntil: t.expires,
        addRandomSuffix: false,
        allowOverwrite: false,
        tokenPayload: payload,
      };
    },
  });
}
export async function uploadedBytes(
  ticket: string,
  shelf: string,
  operation: string,
) {
  const t = verifyTicket(ticket);
  if (t.shelf !== shelf || t.operation !== operation)
    throw new HttpError(422, "Upload does not belong to this operation.");
  await getShelf(shelf);
  const result = await get(t.path, { access: "private", useCache: false });
  if (!result || !result.stream)
    throw new HttpError(422, "Upload not found. Choose the image again.");
  // Stream into a bounded buffer, ignoring client-provided MIME/size claims.
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES)
        throw new HttpError(
          413,
          "Image exceeds 10 MB. Choose a smaller PNG or JPEG.",
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return {
    bytes: Buffer.concat(chunks),
    remove: () => del(t.path),
    uploadId: t.path.split("/").at(-1)!,
    expectedVersion: t.version,
  };
}
