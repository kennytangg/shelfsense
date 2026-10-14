import "server-only";
import { HttpError } from "./validation";
// A worst-case image approaches 1 GiB. Bound processing and queued requests per isolate.
let active = false;
const waiting: Array<() => void> = [];
export async function withImageProcessing<T>(
  work: () => Promise<T>,
): Promise<T> {
  if (active) {
    if (waiting.length >= 8)
      throw new HttpError(503, "Image processing is busy. Retry shortly.");
    await new Promise<void>((done) => waiting.push(done));
  }
  active = true;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active = false;
  }
}
