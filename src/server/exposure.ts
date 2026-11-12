/** Global exposure/white-balance estimate from pixels outside the monitored area. Pure; no OpenCV. */
import type { RGB } from "./shelf-analysis";
import type { ROI } from "./validation";

export type Gain = readonly [number, number, number];
export const NO_GAIN: Gain = [1, 1, 1];
const MAX_SAMPLES = 300_000;
const BIN_WIDTH = 0.02;
const MIN_RATIO = 0.4;
const MAX_RATIO = 2.5;
const BINS = Math.ceil(Math.log(MAX_RATIO / MIN_RATIO) / BIN_WIDTH);
const REF_RANGE = [30, 235] as const;
const CUR_RANGE = [30, 250] as const;
const ROI_MARGIN = 0.02;
const MIN_SAMPLES = 2000;
const MIN_PEAK_SHARE = 0.25;
// Gains inside this band are treated as sensor noise so unchanged scenes stay exact.
const DEADBAND = 0.03;

function outsideRoi(nx: number, ny: number, roi: ROI) {
  return (
    nx < roi.x - ROI_MARGIN ||
    nx > roi.x + roi.width + ROI_MARGIN ||
    ny < roi.y - ROI_MARGIN ||
    ny > roi.y + roi.height + ROI_MARGIN
  );
}
function peakGain(hist: Uint32Array, total: number): number {
  let best = 0,
    bestIndex = -1;
  for (let i = 1; i < hist.length - 1; i++) {
    const mass = hist[i - 1] + hist[i] + hist[i + 1];
    if (mass > best) {
      best = mass;
      bestIndex = i;
    }
  }
  if (bestIndex < 0 || best < MIN_PEAK_SHARE * total) return 1;
  const weighted =
    (hist[bestIndex - 1] * (bestIndex - 1) +
      hist[bestIndex] * bestIndex +
      hist[bestIndex + 1] * (bestIndex + 1)) /
    best;
  const gain = Math.exp(Math.log(MIN_RATIO) + (weighted + 0.5) * BIN_WIDTH);
  return Math.abs(gain - 1) < DEADBAND ? 1 : gain;
}
/**
 * Per-channel gain g such that current ~= g * reference on the unchanged scene.
 * The camera is fixed, so everything outside the ROI should match; the dominant
 * ratio mode there is the exposure/white-balance change. Returns 1 when evidence is weak.
 */
export function estimateGain(reference: RGB, current: RGB, roi: ROI): Gain {
  const stride = Math.max(
    1,
    Math.ceil(Math.sqrt((current.width * current.height) / MAX_SAMPLES)),
  );
  const hists = [0, 1, 2].map(() => new Uint32Array(BINS));
  const totals = [0, 0, 0];
  for (let y = 0; y < current.height; y += stride) {
    const ry = Math.min(
      reference.height - 1,
      Math.floor((y / current.height) * reference.height),
    );
    for (let x = 0; x < current.width; x += stride) {
      if (!outsideRoi(x / current.width, y / current.height, roi)) continue;
      const rx = Math.min(
        reference.width - 1,
        Math.floor((x / current.width) * reference.width),
      );
      const cj = (y * current.width + x) * 3,
        rj = (ry * reference.width + rx) * 3;
      for (let c = 0; c < 3; c++) {
        const r = reference.data[rj + c],
          v = current.data[cj + c];
        if (r < REF_RANGE[0] || r > REF_RANGE[1]) continue;
        if (v < CUR_RANGE[0] || v > CUR_RANGE[1]) continue;
        const bin = Math.floor(Math.log(v / r / MIN_RATIO) / BIN_WIDTH);
        if (bin < 0 || bin >= BINS) continue;
        hists[c][bin]++;
        totals[c]++;
      }
    }
  }
  if (Math.min(...totals) < MIN_SAMPLES) return NO_GAIN;
  return [
    peakGain(hists[0], totals[0]),
    peakGain(hists[1], totals[1]),
    peakGain(hists[2], totals[2]),
  ];
}
/** Divide interleaved RGB bytes by the gain, returning a new buffer. */
export function removeGain(data: Uint8Array, gain: Gain): Uint8Array {
  if (gain.every((g) => g === 1)) return data;
  const luts = gain.map((g) =>
    Uint8Array.from({ length: 256 }, (_, v) =>
      Math.min(255, Math.round(v / g)),
    ),
  );
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = luts[i % 3][data[i]];
  return out;
}
