import "server-only";
/** Opt-in phase timing (SHELFSENSE_TIMING=1); a no-op wrapper otherwise. */
const enabled = () => process.env.SHELFSENSE_TIMING === "1";
export const queryCount = { value: 0 };
export async function timed<T>(
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!enabled()) return work();
  const start = performance.now(),
    queries = queryCount.value;
  try {
    return await work();
  } finally {
    console.log(
      `[timing] ${label} ${Math.round(performance.now() - start)}ms queries=${queryCount.value - queries}`,
    );
  }
}
