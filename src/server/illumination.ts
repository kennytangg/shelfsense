/** Blockwise illumination normalisation. Pure; no OpenCV. */
import type { RGB } from "./shelf-analysis";

const BLOCKS = 8;
const STEP = 5;
const MIN_BLOCK_SAMPLES = 50;
const REF_MIN = 25;
const CUR_MIN = 15;
// Window light can differ a lot between areas, but never by more than this.
const MIN_GAIN = 0.5;
const MAX_GAIN = 2;

// A block's median ratio is trusted only if this share of its pixels sits within TIGHT of it.
const TIGHT = 0.1;
const MIN_TIGHT_SHARE = 0.35;
// Frame-wide lighting change below this is ignored.
const GLOBAL_CHANGE = 0.08;
// Gains this close to 1 are noise, so an unchanged scene stays exact.
const DEADBAND = 0.04;

function clampGain(g: number) {
  if (Math.abs(g - 1) < DEADBAND) return 1;
  return Math.min(MAX_GAIN, Math.max(MIN_GAIN, g));
}
function median(sorted: number[]) {
  return sorted[sorted.length >> 1];
}

const luma = (d: Uint8Array, j: number) =>
  0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];

/**
 * Median current/reference luminance ratio per block of an 8x8 grid. Where a block's ratios
 * do not agree (products cover much of it) the frame-wide median is used instead, so stock
 * is not mistaken for lighting. Gains stay 1 when the frame-wide median shows no lighting change.
 */
export function blockGains(reference: RGB, current: RGB): Float64Array {
  const bw = current.width / BLOCKS,
    bh = current.height / BLOCKS;
  const blocks: number[][] = [];
  const all: number[] = [];
  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      const ratios: number[] = [];
      const y1 = Math.min(current.height, Math.ceil((by + 1) * bh));
      const x1 = Math.min(current.width, Math.ceil((bx + 1) * bw));
      for (let y = Math.floor(by * bh); y < y1; y += STEP) {
        const ry = Math.min(
          reference.height - 1,
          Math.floor((y / current.height) * reference.height),
        );
        for (let x = Math.floor(bx * bw); x < x1; x += STEP) {
          const rx = Math.min(
            reference.width - 1,
            Math.floor((x / current.width) * reference.width),
          );
          const a = luma(reference.data, (ry * reference.width + rx) * 3);
          const b = luma(current.data, (y * current.width + x) * 3);
          if (a > REF_MIN && b > CUR_MIN) ratios.push(b / a);
        }
      }
      ratios.sort((p, q) => p - q);
      blocks.push(ratios);
      all.push(...ratios);
    }
  all.sort((p, q) => p - q);
  const overall = all.length >= MIN_BLOCK_SAMPLES ? median(all) : 1;
  // Most of the frame is unchanged wall or shelf, so a frame-wide median near 1 means the
  // lighting did not change; leave the image alone rather than risk absorbing stock.
  if (Math.abs(overall - 1) < GLOBAL_CHANGE)
    return new Float64Array(BLOCKS * BLOCKS).fill(1);
  return Float64Array.from(blocks, (ratios) => {
    if (ratios.length < MIN_BLOCK_SAMPLES) return clampGain(overall);
    const m = median(ratios);
    const tight = ratios.filter((r) => Math.abs(r / m - 1) < TIGHT).length;
    return clampGain(tight >= MIN_TIGHT_SHARE * ratios.length ? m : overall);
  });
}

/** Divide each pixel by the bilinearly interpolated block gain; returns a new image. */
export function normalizeIllumination(reference: RGB, current: RGB): RGB {
  const gains = blockGains(reference, current);
  const bw = current.width / BLOCKS,
    bh = current.height / BLOCKS;
  const max = BLOCKS - 1.001;
  const out = Buffer.alloc(current.data.length);
  for (let y = 0; y < current.height; y++) {
    const fy = Math.min(max, Math.max(0, y / bh - 0.5)),
      y0 = Math.floor(fy),
      ty = fy - y0;
    for (let x = 0; x < current.width; x++) {
      const fx = Math.min(max, Math.max(0, x / bw - 0.5)),
        x0 = Math.floor(fx),
        tx = fx - x0;
      const top =
        gains[y0 * BLOCKS + x0] * (1 - tx) + gains[y0 * BLOCKS + x0 + 1] * tx;
      const bottom =
        gains[(y0 + 1) * BLOCKS + x0] * (1 - tx) +
        gains[(y0 + 1) * BLOCKS + x0 + 1] * tx;
      const g = top * (1 - ty) + bottom * ty;
      const j = (y * current.width + x) * 3;
      for (let c = 0; c < 3; c++)
        out[j + c] = Math.min(255, Math.round(current.data[j + c] / g));
    }
  }
  return { data: out, width: current.width, height: current.height };
}
