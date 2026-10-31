import type { LayerId, MixState, SceneConfig } from "../core/types";

export const DEFAULT_MASTER = 0.7;

export type MixAction =
  | { type: "layer"; id: LayerId; value: number }
  | { type: "master"; value: number }
  | { type: "window"; open: boolean };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function defaultMix(cfg: SceneConfig): MixState {
  const layers = {} as Record<LayerId, number>;
  for (const l of cfg.layers) layers[l.id] = l.defaultVolume;
  return { version: 1, master: DEFAULT_MASTER, windowOpen: false, layers };
}

export function reduceMix(mix: MixState, action: MixAction): MixState {
  switch (action.type) {
    case "layer":
      return { ...mix, layers: { ...mix.layers, [action.id]: clamp01(action.value) } };
    case "master":
      return { ...mix, master: clamp01(action.value) };
    case "window":
      return { ...mix, windowOpen: action.open };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? clamp01(v) : fallback;
}

/** Boundary: turn untrusted parsed JSON into a valid MixState, field by field. */
export function parseMix(cfg: SceneConfig, raw: unknown): MixState {
  const base = defaultMix(cfg);
  if (!isRecord(raw) || raw.version !== 1) return base;
  const layers = isRecord(raw.layers) ? raw.layers : {};
  const out = { ...base, layers: { ...base.layers } };
  for (const l of cfg.layers) out.layers[l.id] = finite(layers[l.id], base.layers[l.id]);
  out.master = finite(raw.master, base.master);
  out.windowOpen = typeof raw.windowOpen === "boolean" ? raw.windowOpen : base.windowOpen;
  return out;
}

const storageKey = (cfg: SceneConfig): string => `living-ambience:mix:v1:${cfg.id}`;

export function loadMix(cfg: SceneConfig): MixState {
  try {
    const text = window.localStorage.getItem(storageKey(cfg));
    return parseMix(cfg, text === null ? null : JSON.parse(text));
  } catch {
    return defaultMix(cfg);
  }
}

export function saveMix(cfg: SceneConfig, mix: MixState): void {
  try {
    window.localStorage.setItem(storageKey(cfg), JSON.stringify(mix));
  } catch {
    // storage unavailable or full: the mix just will not persist
  }
}

export class MixStore {
  private listeners = new Set<(mix: MixState) => void>();

  constructor(private mix: MixState) {}

  get(): MixState {
    return this.mix;
  }

  dispatch(action: MixAction): void {
    this.mix = reduceMix(this.mix, action);
    for (const fn of this.listeners) fn(this.mix);
  }

  subscribe(fn: (mix: MixState) => void): void {
    this.listeners.add(fn);
  }
}
