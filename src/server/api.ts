import "server-only";
import { withImageProcessing } from "./image-queue";
import { z, ZodError } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import * as service from "./service";
import { query } from "./db";
import {
  HttpError,
  calibrationSchema,
  placementSchema,
  shelfSchema,
} from "./validation";
import { decode, MAX_BYTES } from "./detector";
import { uploadTicket, uploadedBytes, blobUpload } from "./uploads";
import type { HandleUploadBody } from "@vercel/blob/client";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function manifest() {
  return JSON.parse(
    await readFile(resolve("assets/demo/manifest.json"), "utf8"),
  );
}
async function demo(shelfId: string, sample: string) {
  const s = await service.getShelf(shelfId);
  if (!s.demo)
    throw new HttpError(
      400,
      "Built-in samples are available only for synthetic demo shelves.",
    );
  const m = await manifest(),
    entry = m.shelves.find(
      (e: { identifier: string }) => e.identifier === s.identifier,
    );
  if (!entry) throw new HttpError(404, "No bundled sample for this shelf.");
  return decode(
    await readFile(resolve("assets/demo", entry.samples[sample].file)),
  );
}
async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(422, "Invalid JSON request.");
  }
}
async function imageRequest(request: Request, id: string, op: string) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const payload = await body(request),
      token = z.string().parse(payload.upload_ticket);
    const uploaded = await uploadedBytes(token, id, op);
    return {
      ...uploaded,
      config: payload.config,
      version: payload.calibration_version,
      deduplicate: true,
      expectedVersion: uploaded.expectedVersion,
    };
  }
  if (process.env.VERCEL)
    throw new HttpError(422, "Use a direct image upload before processing.");
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES + 1024 * 1024)
    throw new HttpError(
      413,
      "Image exceeds 10 MB. Choose a smaller PNG or JPEG.",
    );
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(422, "Invalid multipart upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File))
    throw new HttpError(422, "Choose an image first.");
  let config;
  try {
    config = JSON.parse(String(form.get("config") ?? "{}"));
  } catch {
    throw new HttpError(422, "Invalid image settings.");
  }
  // decodeUpload records failures while preserving the previous measured reading.
  return {
    bytes:
      file.size > MAX_BYTES
        ? Buffer.alloc(MAX_BYTES + 1)
        : Buffer.from(await file.arrayBuffer()),
    uploadId: undefined,
    config,
    version: Number(form.get("calibration_version")),
    remove: async () => {},
    deduplicate: form.get("ingestion") === "true",
    expectedVersion: form.has("expected_version")
      ? Number(form.get("expected_version"))
      : undefined,
  };
}
async function dispatch(request: Request) {
  try {
    const url = new URL(request.url),
      parts = url.pathname.slice(5).split("/").filter(Boolean),
      method = request.method;
    if (parts.join("/") === "health" && method === "GET") {
      await query("SELECT 1");
      return json({ api: "ready", database: "ready" });
    }
    if (parts.join("/") === "store" && method === "GET")
      return json(await service.activeStore());
    if (parts.join("/") === "uploads" && method === "POST") {
      const b = await body(request);
      return json(
        await uploadTicket(
          z.string().parse(b.shelf_id),
          z.string().parse(b.operation),
        ),
      );
    }
    if (parts.join("/") === "uploads/blob" && method === "POST")
      return json(
        await blobUpload(request, (await body(request)) as HandleUploadBody),
      );
    if (parts.join("/") === "dashboard" && method === "GET") {
      const shelves = await service.listShelves(),
        placement = (s: (typeof shelves)[number]) =>
          s.current?.placement_result?.status === "Placement review";
      return json({
        total: shelves.length,
        full: shelves.filter((s) => s.status === "Full").length,
        low: shelves.filter((s) => s.status === "Low").length,
        empty: shelves.filter((s) => s.status === "Empty").length,
        unavailable: shelves.filter((s) => !s.current).length,
        placement_review: shelves.filter(placement).length,
        attention: shelves.filter(
          (s) => ["Low", "Empty"].includes(s.status) || placement(s),
        ),
      });
    }
    if (parts[0] === "shelves" && parts.length === 1) {
      if (method === "POST")
        return json(
          await service.shelfOut(
            await service.createShelf(shelfSchema.parse(await body(request))),
          ),
          201,
        );
      if (method === "GET") {
        const search = (url.searchParams.get("search") ?? "").toLowerCase(),
          status = url.searchParams.get("status"),
          aisle = url.searchParams.get("aisle");
        return json(
          (await service.listShelves()).filter(
            (s) =>
              (!search ||
                `${s.identifier} ${s.name}`.toLowerCase().includes(search)) &&
              (!status ||
                s.status === status ||
                (status === "Unavailable" && !s.current) ||
                (status === "Placement review" &&
                  s.current?.placement_result?.status ===
                    "Placement review")) &&
              (!aisle || s.location === aisle),
          ),
        );
      }
    }
    if (parts[0] === "shelves" && parts[1]) {
      const id = parts[1],
        op = parts[2];
      await service.getShelf(id);
      if (parts.length === 2 && method === "GET")
        return json(await service.shelfOut(await service.getShelf(id)));
      if (parts.length === 3) {
        if (op === "analyses" && method === "GET") {
          const limit = z.coerce
            .number()
            .int()
            .min(1)
            .max(200)
            .parse(url.searchParams.get("limit") ?? 50);
          return json(
            await Promise.all(
              (
                await query(
                  "SELECT * FROM analyses WHERE shelf_id=$1 ORDER BY created_at DESC LIMIT $2",
                  [id, limit],
                )
              ).map((a) => service.analysisOut(a)),
            ),
          );
        }
        if (op === "placement" && method === "DELETE") {
          await service.disablePlacement(id);
          return json(await service.shelfOut(await service.getShelf(id)));
        }
        if (
          ["calibration", "placement", "analyses"].includes(op) &&
          method === "POST"
        ) {
          const upload = await imageRequest(request, id, op);
          let succeeded = false;
          try {
            const config =
              op === "calibration"
                ? calibrationSchema.parse(upload.config)
                : op === "placement"
                  ? placementSchema.parse(upload.config)
                  : null;
            const version =
              op === "placement"
                ? z.number().int().min(0).parse(upload.version)
                : undefined;
            const image = await service.decodeUpload(id, upload.bytes);
            if (op === "calibration")
              await service.calibrate(
                id,
                image,
                config as z.infer<typeof calibrationSchema>,
                false,
                {
                  uploadId: upload.uploadId,
                  expectedVersion: upload.expectedVersion,
                },
              );
            else if (op === "placement")
              await service.configurePlacement(
                id,
                image,
                config as z.infer<typeof placementSchema>,
                version!,
                false,
                upload.uploadId,
              );
            else {
              const analysisId = await service.analyze(id, image, {
                digest: upload.deduplicate
                  ? createHash("sha256").update(upload.bytes).digest("hex")
                  : undefined,
                expectedVersion:
                  upload.expectedVersion === undefined
                    ? undefined
                    : z.number().int().min(0).parse(upload.expectedVersion),
              });
              succeeded = true;
              return json(
                await service.analysisOut(
                  (
                    await query("SELECT * FROM analyses WHERE id=$1", [
                      analysisId,
                    ])
                  )[0],
                ),
                201,
              );
            }
            succeeded = true;
            return json(await service.shelfOut(await service.getShelf(id)));
          } finally {
            if (!succeeded) await upload.remove();
          }
        }
        if (op === "demo-analysis" && method === "POST") {
          const b = await body(request),
            sample = z
              .enum(["full", "low", "empty", "mismatched", "misplaced"])
              .parse(b.sample);
          const a = await service.analyze(id, await demo(id, sample), {
            demo: true,
          });
          return json(
            await service.analysisOut(
              (await query("SELECT * FROM analyses WHERE id=$1", [a]))[0],
            ),
            201,
          );
        }
        if (op === "demo-placement" && method === "POST") {
          const b = await body(request);
          await service.configurePlacement(
            id,
            await demo(id, "full"),
            placementSchema.parse({}),
            z.number().int().min(0).parse(b.calibration_version),
            true,
          );
          return json(await service.shelfOut(await service.getShelf(id)));
        }
      }
    }
    if (parts[0] === "images" && parts.length === 2 && method === "GET") {
      const a = (
        await query("SELECT * FROM image_assets WHERE id=$1", [parts[1]])
      )[0];
      if (!a) throw new HttpError(404, "Image not found.");
      await service.getShelf(a.shelf_id);
      return json(await service.assetOut(a.id));
    }
    if (parts[0] === "alerts") {
      if (parts.length === 1 && method === "GET") {
        const store = await service.activeStore(),
          state = url.searchParams.get("state");
        return json(
          await Promise.all(
            (
              await query(
                `SELECT a.* FROM alerts a JOIN shelves s ON s.id=a.shelf_id WHERE s.store_id=$1${state ? " AND a.state=$2" : ""} ORDER BY a.last_detected_at DESC`,
                state ? [store.id, state] : [store.id],
              )
            ).map((a) => service.alertOut(a)),
          ),
        );
      }
      if (parts.length === 2 && method === "PATCH") {
        const action = z
          .enum(["acknowledge", "report_restocked"])
          .parse((await body(request)).action);
        await service.staffAction(parts[1], action);
        return json(
          await service.alertOut(
            (await query("SELECT * FROM alerts WHERE id=$1", [parts[1]]))[0],
          ),
        );
      }
    }
    throw new HttpError(404, "Route not found.");
  } catch (e) {
    return errorResponse(e);
  }
}
export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ detail: e.message }, e.status);
  if (e instanceof ZodError)
    return json({ detail: e.issues.map((i) => i.message).join("; ") }, 422);
  let cause = e as { code?: string; cause?: unknown };
  while (!cause.code && cause.cause) cause = cause.cause as typeof cause;
  const code = cause.code;
  if (code?.startsWith("23"))
    return json(
      {
        detail:
          "This change conflicts with an existing record. Check the shelf identifier and refresh.",
      },
      409,
    );
  if (
    code?.startsWith("08") ||
    ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "57P01"].includes(code ?? "")
  )
    return json(
      { detail: "PostgreSQL is unavailable. Start the database and retry." },
      503,
    );
  console.error(
    "ShelfSense request failed",
    e instanceof Error ? e.message : "Unknown failure",
  );
  return json(
    {
      detail: "Unable to complete this request. Retry or contact the operator.",
    },
    500,
  );
}

export async function handle(request: Request) {
  try {
    const imageOperation =
      request.method === "POST" &&
      /^\/api\/shelves\/[^/]+\/(analyses|calibration|placement|demo-analysis|demo-placement)$/.test(
        new URL(request.url).pathname,
      );
    return imageOperation
      ? await withImageProcessing(() => dispatch(request))
      : await dispatch(request);
  } catch (e) {
    return errorResponse(e);
  }
}
