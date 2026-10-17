/** Independent OpenCV/WASM processing; no persistence, UI, or fixture dependencies. */
import sharp from "sharp";
import cvModule from "@techstark/opencv-js";
import type { Mat } from "@techstark/opencv-js";
import {
  HttpError,
  type ROI,
  type Settings,
  type PlacementSettings,
} from "./validation";
export const ALGORITHM_VERSION = "empty-reference-lab/1.0";
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 20_000_000;
export type RGB = { data: Buffer; width: number; height: number };
export type Detection = {
  outcome: string;
  classification: string | null;
  occupancy_ratio: number | null;
  warnings: string[];
  duration_ms: number;
  overlay?: RGB;
  mask?: RGB;
};
export async function decode(bytes: Buffer, managed = false): Promise<RGB> {
  if (!managed && bytes.length > MAX_BYTES)
    throw new HttpError(
      413,
      "Image exceeds 10 MB. Choose a smaller PNG or JPEG.",
    );
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS });
    const info = await image.metadata();
    if (!["png", "jpeg"].includes(info.format ?? ""))
      throw new HttpError(422, "Only PNG and JPEG images are supported.");
    if (!info.width || !info.height || Math.min(info.width, info.height) < 64)
      throw new HttpError(
        422,
        "Image is too small; both dimensions must be at least 64 pixels.",
      );
    if (info.width * info.height > MAX_PIXELS)
      throw new HttpError(
        422,
        "Image exceeds the 20 million decoded-pixel limit.",
      );
    const { data, info: raw } = await image
      .rotate()
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: raw.width, height: raw.height };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      422,
      String(e).includes("pixel limit")
        ? "Image exceeds the 20 million decoded-pixel limit."
        : "Cannot decode this image. Choose a complete PNG or JPEG.",
    );
  }
}
export function classify(ratio: number, s: Settings) {
  return ratio < s.empty_threshold
    ? "Empty"
    : ratio < s.full_threshold
      ? "Low"
      : "Full";
}
// Round ties to even for stable ROI boundaries and resize dimensions.
function round(x: number) {
  const n = Math.floor(x);
  return x - n === 0.5 ? n + (n % 2) : Math.round(x);
}
function bounds(i: RGB, r: ROI) {
  return [
    round(r.x * i.width),
    round(r.y * i.height),
    round((r.x + r.width) * i.width),
    round((r.y + r.height) * i.height),
  ];
}
function histogramMedian(
  hist: Uint32Array,
  count: number,
  transform: (value: number) => number = (v) => v,
) {
  const first = Math.floor((count - 1) / 2),
    second = Math.floor(count / 2);
  let cumulative = 0,
    a = 0,
    b = 0,
    found = false;
  for (let n = 0; n < hist.length; n++) {
    cumulative += hist[n];
    if (!found && cumulative > first) {
      a = transform(n);
      found = true;
    }
    if (cumulative > second) {
      b = transform(n);
      break;
    }
  }
  return (a + b) / 2;
}
export async function detect(
  reference: RGB,
  current: RGB,
  roi: ROI,
  settings: Settings,
): Promise<Detection> {
  const start = performance.now();
  const review = (reason: string): Detection => ({
    outcome: "Review required",
    classification: null,
    occupancy_ratio: null,
    warnings: [reason],
    duration_ms: performance.now() - start,
  });
  if (
    Math.abs(
      current.width / current.height / (reference.width / reference.height) - 1,
    ) > 0.025
  )
    return review(
      "Image framing has an incompatible aspect ratio. Retake from the reference position.",
    );
  const ab = bounds(reference, roi),
    bb = bounds(current, roi);
  if (Math.min(ab[2] - ab[0], ab[3] - ab[1], bb[2] - bb[0], bb[3] - bb[1]) < 32)
    return review(
      "Selected ROI is too small; use at least 32 source pixels per side.",
    );
  const width = settings.processing_width,
    height = Math.max(32, round((width * (ab[3] - ab[1])) / (ab[2] - ab[0])));
  if (height > 4096)
    return review("ROI is too tall and narrow. Choose a wider display area.");
  const cv = await cvModule;
  const allocated: Mat[] = [];
  const mat = () => {
    const m = new cv.Mat();
    allocated.push(m);
    return m;
  };
  try {
    function crop(i: RGB, b: number[]) {
      const src = cv.matFromArray(i.height, i.width, cv.CV_8UC3, i.data);
      allocated.push(src);
      const region = src.roi(new cv.Rect(b[0], b[1], b[2] - b[0], b[3] - b[1]));
      allocated.push(region);
      const out = mat();
      cv.resize(region, out, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
      return out;
    }
    const a = crop(reference, ab),
      b = crop(current, bb),
      gray = mat();
    cv.cvtColor(b, gray, cv.COLOR_RGB2GRAY);
    let sum = 0,
      sq = 0;
    for (const v of gray.data) {
      sum += v;
      sq += v * v;
    }
    const mean = sum / gray.data.length;
    if (mean < 12 || mean > 245)
      return review(
        "Photo is severely underexposed or overexposed. Adjust lighting and try again.",
      );
    if (Math.sqrt(sq / gray.data.length - mean * mean) < 3)
      return review("Photo has insufficient detail for a reliable comparison.");
    const lap = mat();
    cv.Laplacian(gray, lap, cv.CV_64F);
    sum = 0;
    sq = 0;
    for (const v of lap.data64F) {
      sum += v;
      sq += v * v;
    }
    if (sq / lap.data64F.length - (sum / lap.data64F.length) ** 2 < 2)
      return review("Photo is too blurred. Hold the camera steady and retake.");
    const lab = (src: Mat) => {
      const blur = mat(),
        out = mat();
      cv.GaussianBlur(src, blur, new cv.Size(3, 3), 0);
      cv.cvtColor(blur, out, cv.COLOR_RGB2Lab);
      return out;
    };
    const la = lab(a),
      lb = lab(b),
      raw = new Uint8Array(width * height),
      lights = new Uint32Array(511),
      chromas = new Uint32Array(130051);
    for (let p = 0; p < raw.length; p++) {
      const j = p * 3,
        l = lb.data[j] - la.data[j],
        u = lb.data[j + 1] - la.data[j + 1],
        v = lb.data[j + 2] - la.data[j + 2];
      lights[l + 255]++;
      chromas[u * u + v * v]++;
      raw[p] = Math.hypot(l, u, v) >= settings.difference_threshold ? 255 : 0;
    }
    if (
      Math.abs(histogramMedian(lights, raw.length, (v) => v - 255)) > 48 &&
      histogramMedian(chromas, raw.length, Math.sqrt) < 8
    )
      return review(
        "Large lighting change detected. Match the reference lighting.",
      );
    const mask = cv.matFromArray(height, width, cv.CV_8UC1, raw);
    allocated.push(mask);
    const kernel = cv.Mat.ones(
      settings.morphology_size,
      settings.morphology_size,
      cv.CV_8U,
    );
    allocated.push(kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    const labels = mat(),
      stats = mat(),
      centroids = mat();
    cv.connectedComponentsWithStats(mask, labels, stats, centroids);
    let count = 0;
    for (let p = 0; p < raw.length; p++) {
      const label = labels.data32S[p];
      mask.data[p] =
        label > 0 &&
        stats.data32S[label * 5 + cv.CC_STAT_AREA] >=
          settings.min_component_pixels
          ? 255
          : 0;
      if (mask.data[p]) count++;
    }
    const out = Buffer.from(current.data),
      selected = mat();
    cv.resize(
      mask,
      selected,
      new cv.Size(bb[2] - bb[0], bb[3] - bb[1]),
      0,
      0,
      cv.INTER_NEAREST,
    );
    for (let y = bb[1]; y < bb[3]; y++)
      for (let x = bb[0]; x < bb[2]; x++) {
        const j = (y * current.width + x) * 3;
        if (selected.data[(y - bb[1]) * (bb[2] - bb[0]) + x - bb[0]])
          for (let c = 0; c < 3; c++)
            out[j + c] = Math.floor(
              out[j + c] * 0.55 + [20, 190, 155][c] * 0.45,
            );
      }
    const overlay = cv.matFromArray(
      current.height,
      current.width,
      cv.CV_8UC3,
      out,
    );
    allocated.push(overlay);
    cv.rectangle(
      overlay,
      new cv.Point(bb[0], bb[1]),
      new cv.Point(bb[2] - 1, bb[3] - 1),
      new cv.Scalar(0, 145, 120),
      3,
    );
    const ratio = count / raw.length;
    return {
      outcome: "Valid",
      classification: classify(ratio, settings),
      occupancy_ratio: ratio,
      warnings: [],
      duration_ms: performance.now() - start,
      overlay: {
        data: Buffer.from(overlay.data),
        width: current.width,
        height: current.height,
      },
      mask: { data: Buffer.from(mask.data), width, height },
    };
  } finally {
    for (const m of allocated.reverse()) m.delete();
  }
}
export async function comparePlacement(
  empty: RGB,
  expected: RGB,
  current: RGB,
  roi: ROI,
  s: Settings,
  config: PlacementSettings,
  stock: Detection,
) {
  const expectedStock = await detect(empty, expected, roi, s);
  const base = {
    mismatch_ratio: null as number | null,
    compared_ratio: 0,
    algorithm_version: "occupied-appearance-lab/1.0",
  };
  if (stock.outcome !== "Valid" || expectedStock.outcome !== "Valid")
    return {
      ...base,
      status: "Not enough evidence",
      reason: "A reliable stock comparison is required.",
    };
  const cv = await cvModule,
    allocated: Mat[] = [];
  const keep = (m: Mat) => {
    allocated.push(m);
    return m;
  };
  try {
    const width = stock.mask!.width,
      height = stock.mask!.height;
    const a = keep(
        cv.matFromArray(height, width, cv.CV_8UC1, stock.mask!.data),
      ),
      b = keep(
        cv.matFromArray(height, width, cv.CV_8UC1, expectedStock.mask!.data),
      ),
      kernel = keep(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.erode(a, a, kernel);
    cv.erode(b, b, kernel);
    const shared = new Uint8Array(width * height);
    let count = 0;
    for (let p = 0; p < shared.length; p++)
      if (a.data[p] && b.data[p]) {
        shared[p] = 1;
        count++;
      }
    const compared = count / shared.length;
    if (compared < config.min_shared_ratio)
      return {
        ...base,
        status: "Not enough evidence",
        compared_ratio: compared,
        reason:
          "Too little overlapping product area; inspect stock coverage first.",
      };
    function lab(i: RGB) {
      const bd = bounds(i, roi),
        src = keep(cv.matFromArray(i.height, i.width, cv.CV_8UC3, i.data)),
        crop = keep(
          src.roi(new cv.Rect(bd[0], bd[1], bd[2] - bd[0], bd[3] - bd[1])),
        ),
        out = keep(new cv.Mat());
      cv.resize(crop, out, new cv.Size(width, height), 0, 0, cv.INTER_AREA);
      cv.GaussianBlur(out, out, new cv.Size(3, 3), 0);
      cv.cvtColor(out, out, cv.COLOR_RGB2Lab);
      return out;
    }
    const la = lab(expected),
      lb = lab(current),
      mismatch = new Uint8Array(shared.length);
    let changed = 0;
    for (let p = 0; p < shared.length; p++) {
      const j = p * 3;
      if (
        shared[p] &&
        Math.hypot(
          lb.data[j] - la.data[j],
          lb.data[j + 1] - la.data[j + 1],
          lb.data[j + 2] - la.data[j + 2],
        ) >= config.appearance_distance
      ) {
        mismatch[p] = 255;
        changed++;
      }
    }
    const ratio = changed / count,
      flagged = ratio >= config.mismatch_threshold;
    if (flagged && stock.overlay) {
      const bd = bounds(current, roi),
        mask = keep(cv.matFromArray(height, width, cv.CV_8UC1, mismatch)),
        selected = keep(new cv.Mat());
      cv.resize(
        mask,
        selected,
        new cv.Size(bd[2] - bd[0], bd[3] - bd[1]),
        0,
        0,
        cv.INTER_NEAREST,
      );
      for (let y = bd[1]; y < bd[3]; y++)
        for (let x = bd[0]; x < bd[2]; x++)
          if (selected.data[(y - bd[1]) * (bd[2] - bd[0]) + x - bd[0]])
            for (let c = 0; c < 3; c++) {
              const j = (y * current.width + x) * 3 + c;
              stock.overlay.data[j] = Math.floor(
                current.data[j] * 0.2 + [255, 130, 25][c] * 0.8,
              );
            }
    }
    return {
      ...base,
      status: flagged ? "Placement review" : "Matches reference",
      mismatch_ratio: ratio,
      compared_ratio: compared,
      reason: flagged
        ? "Occupied appearance differs from the expected layout. Inspect for misplaced items, lighting changes, or camera movement."
        : "Compared occupied areas match the expected appearance; missing areas are excluded.",
    };
  } finally {
    for (const m of allocated.reverse()) m.delete();
  }
}
export function png(image: RGB) {
  return sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.data.length / (image.width * image.height) === 1 ? 1 : 3,
    },
  })
    .png()
    .toBuffer();
}
