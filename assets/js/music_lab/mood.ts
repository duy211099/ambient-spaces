import type { LayerSettings } from "./settings.ts";

export interface EffectiveLayer {
  density: number;
  brightness: number;
  send: number;
  velocity: [number, number];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

export function effectiveLayer(layer: LayerSettings, mood: number): EffectiveLayer {
  const d = mood - 0.5;
  return {
    density: clamp01(layer.density + 0.4 * d),
    brightness: clamp01(layer.brightness + 0.3 * d),
    send: clamp01(layer.send - 0.3 * d),
    velocity: [clamp(0.3 + 0.2 * d, 0.1, 1), clamp(0.7 + 0.25 * d, 0.1, 1)],
  };
}
