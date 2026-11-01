import { ENO_INTERVALS, ENO_OFFSETS } from "./notesets.ts";
import type { Rng } from "./rng.ts";

export function gapRange(density: number, weight: number): [number, number] {
  return [(20 - 18.5 * density) / weight, (40 - 36 * density) / weight];
}

export function enoScale(density: number): number {
  return 2 ** ((0.5 - density) * 2);
}

export function enoLoops(noteCount: number, density: number, rng: Rng): { interval: number; offset: number }[] {
  const scale = enoScale(density);
  const loops: { interval: number; offset: number }[] = [];
  for (let i = 0; i < noteCount; i++) {
    if (i < ENO_INTERVALS.length) {
      loops.push({ interval: ENO_INTERVALS[i] * scale, offset: ENO_OFFSETS[i] });
    } else {
      const interval = rng.between(16, 30) + rng.next();
      loops.push({ interval: interval * scale, offset: rng.between(0, 20) });
    }
  }
  return loops;
}

export function randomOnceIntervals(noteCount: number, density: number, weights: number[], rng: Rng): number[] {
  const out: number[] = [];
  for (let i = 0; i < noteCount; i++) {
    const [lo, hi] = gapRange(density, weights[i] ?? 1);
    out.push(rng.between(lo, hi));
  }
  return out;
}
