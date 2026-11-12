// Prints expected/status/coverage/level per frame for every present set and both areas.
import { REAL_SETS, WHOLE_IMAGE, hasSet, measureSet } from "./real-shelves";

const f = (n: number | null) => (n === null ? "  n/a" : n.toFixed(3));
for (const set of REAL_SETS) {
  if (!hasSet(set)) continue;
  for (const [label, area] of [
    ["A whole", WHOLE_IMAGE],
    ["B tight", set.tight],
  ] as const) {
    const { full, rows } = await measureSet(set, area);
    console.log(
      `\n== ${set.name} [${label}]${set.gated ? "" : " (informational)"} F=${full.toFixed(3)}`,
    );
    for (const r of rows)
      console.log(
        `${r.file.padEnd(22)} exp=${r.expected.padEnd(5)} got=${String(r.status ?? r.outcome).padEnd(5)} ${r.status === r.expected ? "ok  " : "FAIL"} cov=${f(r.coverage)} level=${f(r.level)}`,
      );
  }
}
