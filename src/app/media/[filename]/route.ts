import { query } from "@/server/db";
import { getShelf } from "@/server/service";
import { imageStream } from "@/server/storage";
import { errorResponse } from "@/server/api";
import { HttpError } from "@/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await context.params;
    if (!/^[0-9a-f-]{36}\.png$/.test(filename))
      throw new HttpError(404, "Image not found.");
    const id = filename.slice(0, -4);
    const asset = (
      await query(
        "SELECT * FROM image_assets WHERE id=$1 OR storage_key=$2 OR storage_key=$3",
        [id, filename, `blob:media/${filename}`],
      )
    )[0];
    if (!asset) throw new HttpError(404, "Image not found.");
    await getShelf(asset.shelf_id);
    return new Response(await imageStream(asset.storage_key), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
