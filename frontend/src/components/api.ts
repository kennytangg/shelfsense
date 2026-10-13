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
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { cache: "no-store", ...init });
  } catch {
    throw new Error(
      "Cannot reach ShelfSense. Check that the web app and Python API are running.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : Array.isArray(body?.detail)
          ? body.detail.map((e: { msg: string }) => e.msg).join("; ")
          : "The Python API is unavailable. Start it and try again.";
    throw new Error(message);
  }
  return response.json();
}
export const json = (data: unknown, method = "POST") => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
export const percent = (ratio: number | null | undefined) =>
  ratio == null ? "—" : `${(ratio * 100).toFixed(1)}%`;
export const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not checked yet";
