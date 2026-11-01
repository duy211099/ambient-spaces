import { CAPS, type DriftTarget } from "../settings.ts";

export const DAMPENING_HZ: readonly [number, number] = [200, 20000];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The values a drift target may legally take, in the target's own units. */
export function legalRange(target: DriftTarget): readonly [number, number] {
  if (target === "bus.dampening") return DAMPENING_HZ;
  if (target === "bus.delayFeedback") return [0, CAPS.delayFeedbackMax];
  if (target.endsWith(".volume")) return CAPS.layerDb;
  return [0, 1]; // reverbWet, reverbSize, brightness, density
}

/** Half the legal span times depth, centred on `base` and clamped to the legal range. */
export function driftRange(target: DriftTarget, base: number, depth: number): [number, number] {
  const [lo, hi] = legalRange(target);
  const centre = clamp(base, lo, hi);
  const half = clamp(depth, 0, 1) * 0.5 * (hi - lo);
  return [clamp(centre - half, lo, hi), clamp(centre + half, lo, hi)];
}

/** A sine wave scaled to [0, 1]. `phase` is in radians; `t` and `periodSec` in seconds. */
export function sineAt(periodSec: number, phase: number, t: number): number {
  return 0.5 + 0.5 * Math.sin(2 * Math.PI * (t / periodSec) + phase);
}
