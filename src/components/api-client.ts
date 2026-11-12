export type Asset = {
  id: string;
  url: string;
  width: number;
  height: number;
  role: string;
};
export type ROI = { x: number; y: number; width: number; height: number };
export type Settings = {
  difference_threshold: number;
  processing_width: number;
  morphology_size: number;
  min_component_pixels: number;
  empty_threshold: number;
  full_threshold: number;
  stocked_coverage?: number | null;
};
export type PlacementSettings = {
  appearance_distance: number;
  mismatch_threshold: number;
  min_shared_ratio: number;
};
export type PlacementResult = {
  status: string;
  mismatch_ratio: number | null;
  compared_ratio: number;
  reason: string;
  algorithm_version: string;
};
export type Analysis = {
  id: string;
  /** True when the same photo was already checked and the earlier result is returned. */
  duplicate?: boolean;
  shelf_id: string;
  outcome: string;
  classification: string | null;
  occupancy_ratio: number | null;
  warnings: string[];
  algorithm_version: string;
  calibration_version: number;
  snapshot: {
    roi: ROI;
    settings: Settings;
    placement_settings: PlacementSettings | null;
  };
  duration_ms: number;
  created_at: string;
  input: Asset;
  reference: Asset | null;
  overlay: Asset | null;
  mask: Asset | null;
  placement_reference: Asset | null;
  placement_result: PlacementResult | null;
};
export type Alert = {
  id: string;
  shelf_id: string;
  severity: string;
  state: string;
  first_detected_at: string;
  last_detected_at: string;
  resolution_reason: string | null;
  resolved_at: string | null;
  occupancy_ratio: number;
  identifier: string;
  location: string;
};
export type Shelf = {
  id: string;
  identifier: string;
  name: string;
  location: string;
  category: string | null;
  demo: boolean;
  calibration_version: number;
  roi: ROI | null;
  settings: Settings;
  reference: Asset | null;
  placement_reference: Asset | null;
  placement_settings: PlacementSettings;
  status: string;
  current: Analysis | null;
  latest_attempt: Analysis | null;
  active_alert: Alert | null;
  awaiting_verification: boolean;
  reported_restocked_at: string | null;
  last_error: string | null;
  last_attempt_at: string | null;
};
export type Dashboard = {
  total: number;
  full: number;
  low: number;
  empty: number;
  unavailable: number;
  placement_review: number;
  attention: Shelf[];
};
export type Store = { name: string; location: string };
const TRANSIENT = new Set([502, 503, 504]);
/** PATCH actions are idempotent on the server, so one retry is safe. */
async function send(path: string, init?: RequestInit): Promise<Response> {
  const attempts = init?.method === "PATCH" ? 2 : 1;
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await new Promise((done) => setTimeout(done, 800));
    try {
      const response = await fetch(`/api${path}`, {
        cache: "no-store",
        ...init,
      });
      if (!TRANSIENT.has(response.status) || attempt === attempts - 1)
        return response;
    } catch (error) {
      last = error;
    }
  }
  const changes = !!init?.method && init.method !== "GET";
  throw new Error(
    changes
      ? "The connection dropped before ShelfSense confirmed this change. Refresh to see whether it was saved."
      : "Cannot reach ShelfSense. Check that the web app is running.",
    { cause: last },
  );
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : Array.isArray(body?.detail)
          ? body.detail.map((e: { msg: string }) => e.msg).join("; ")
          : "ShelfSense is unavailable. Retry or contact the operator.";
    throw new Error(message);
  }
  return response.json();
}
export const json = (data: unknown, method = "POST") => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
export const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not checked yet";

/** Local multipart and hosted direct uploads share the existing workflow API. */
export async function uploadImage<T>(
  shelfId: string,
  operation: string,
  file: Blob,
  fields: Record<string, unknown> = {},
  stocked?: Blob,
): Promise<T> {
  const [ticket, stockedTicket] = await Promise.all([
    requestTicket(shelfId, operation),
    stocked ? requestTicket(shelfId, "stocked") : undefined,
  ]);
  if (ticket.storage === "local") {
    const form = new FormData();
    form.append("file", file, "photo.png");
    if (stocked) form.append("stocked", stocked, "stocked.png");
    for (const [key, value] of Object.entries(fields))
      form.append(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
      );
    return api<T>(`/shelves/${shelfId}/${operation}`, {
      method: "POST",
      body: form,
    });
  }
  await Promise.all([
    putBlob(ticket, file),
    stocked && stockedTicket ? putBlob(stockedTicket, stocked) : undefined,
  ]);
  return api<T>(
    `/shelves/${shelfId}/${operation}`,
    json({
      ...fields,
      upload_ticket: ticket.ticket,
      ...(stockedTicket ? { stocked_ticket: stockedTicket.ticket } : {}),
    }),
  );
}
type UploadTicket = { storage: string; ticket: string; pathname: string };
const requestTicket = (shelfId: string, operation: string) =>
  api<UploadTicket>("/uploads", json({ shelf_id: shelfId, operation }));
async function putBlob(ticket: UploadTicket, file: Blob) {
  const { upload } = await import("@vercel/blob/client");
  await upload(ticket.pathname, file, {
    access: "private",
    handleUploadUrl: "/api/uploads/blob",
    clientPayload: ticket.ticket,
    contentType: file.type || "image/png",
  });
}
