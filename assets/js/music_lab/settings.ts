import { NOTE_SETS } from "./notesets.ts";
import { DEFAULT_NOTES_INSTRUMENT } from "./piano.ts";

export type InstrumentId = "piano" | "keys" | "pad" | "bell" | "tone";
export type TimingMode = "eno" | "randomOnce" | "randomEvery";
export type ReverbKind = "freeverb" | "convolver";

export interface LayerSettings {
  id: string;
  label: string;
  instrument: InstrumentId;
  mode: TimingMode;
  noteSetIds: string[]; // [0] is the starting set; length >= 2 enables chord changes
  changeEverySec: [number, number];
  weights: Record<string, number>; // note -> 0.25..4, missing = 1
  density: number;
  brightness: number;
  volumeDb: number;
  send: number;
  muted: boolean;
}

export interface BusSettings {
  reverbKind: ReverbKind;
  reverbSize: number;
  dampeningHz: number;
  delayTime: number;
  delayFeedback: number;
  delayWet: number;
}

export type DriftTarget =
  | "bus.reverbWet"
  | "bus.reverbSize"
  | "bus.dampening"
  | "bus.delayFeedback"
  | `layer.${string}.brightness`
  | `layer.${string}.volume`
  | `layer.${string}.density`;

export interface DriftSettings {
  id: string;
  target: DriftTarget;
  periodSec: number;
  depth: number;
  enabled: boolean;
  modulatedBy: string | null; // another drift id (drift-on-drift)
}

export interface StudioSettings {
  version: 1;
  seed: number;
  mood: number;
  masterDb: number;
  bus: BusSettings;
  layers: LayerSettings[];
  drifts: DriftSettings[];
}

export const CAPS = {
  delayFeedbackMax: 0.8,
  filterQMax: 1,
  layerDb: [-40, -6],
  masterDb: [-40, -3],
  limiterDb: -1,
  // Freeverb feeds room size straight into its comb feedback; near 1 the tail never decays and builds up.
  reverbSizeMax: 0.9,
  weight: [0.25, 4],
  seedMax: 2 ** 31 - 1,
  maxLayers: 8,
  maxDrifts: 16,
  maxWeightKeys: 32,
  labelMax: 40,
} as const;

const INSTRUMENTS: readonly InstrumentId[] = ["piano", "keys", "pad", "bell", "tone"];
const MODES: readonly TimingMode[] = ["eno", "randomOnce", "randomEvery"];
const REVERBS: readonly ReverbKind[] = ["freeverb", "convolver"];
const BUS_TARGETS = ["bus.reverbWet", "bus.reverbSize", "bus.dampening", "bus.delayFeedback"];
const LAYER_PARAMS = ["brightness", "volume", "density"];

export const DEFAULT_SETTINGS: StudioSettings = {
  version: 1,
  seed: 1,
  mood: 0.5,
  masterDb: -10,
  bus: {
    reverbKind: "freeverb",
    reverbSize: 0.8,
    dampeningHz: 3000,
    delayTime: 0.4,
    delayFeedback: 0.35,
    delayWet: 0.25,
  },
  layers: [
    {
      id: "drone", label: "Drone", instrument: "pad", mode: "randomEvery",
      noteSetIds: ["drone", "droneNight"], changeEverySec: [180, 420], weights: {},
      density: 0.15, brightness: 0.4, volumeDb: -20, send: 0.6, muted: false,
    },
    {
      id: "notes", label: "Notes", instrument: DEFAULT_NOTES_INSTRUMENT, mode: "randomEvery",
      noteSetIds: ["airports", "airportsAlt"], changeEverySec: [180, 420], weights: {},
      density: 0.35, brightness: 0.5, volumeDb: -14, send: 0.5, muted: false,
    },
    {
      id: "bells", label: "Bells", instrument: "bell", mode: "randomEvery",
      noteSetIds: ["bellsHigh"], changeEverySec: [180, 420], weights: {},
      density: 0.1, brightness: 0.6, volumeDb: -22, send: 0.7, muted: false,
    },
  ],
  drifts: [
    { id: "reverb", target: "bus.reverbWet", periodSec: 1000, depth: 0.8, enabled: true, modulatedBy: null },
  ],
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}
function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function normalizeBus(raw: unknown): BusSettings {
  const d = DEFAULT_SETTINGS.bus;
  const r = isObj(raw) ? raw : {};
  return {
    reverbKind: pick(r.reverbKind, REVERBS, d.reverbKind),
    reverbSize: num(r.reverbSize, d.reverbSize, 0, CAPS.reverbSizeMax),
    dampeningHz: num(r.dampeningHz, d.dampeningHz, 200, 20000),
    delayTime: num(r.delayTime, d.delayTime, 0.05, 1),
    delayFeedback: num(r.delayFeedback, d.delayFeedback, 0, CAPS.delayFeedbackMax),
    delayWet: num(r.delayWet, d.delayWet, 0, 1),
  };
}

function normalizeLayer(raw: unknown): LayerSettings | null {
  if (!isObj(raw) || typeof raw.id !== "string" || raw.id.length === 0) return null;
  const d = DEFAULT_SETTINGS.layers.find((l) => l.id === raw.id) ?? DEFAULT_SETTINGS.layers[1];
  const ids = Array.isArray(raw.noteSetIds)
    ? raw.noteSetIds.filter((x): x is string => typeof x === "string" && Object.prototype.hasOwnProperty.call(NOTE_SETS, x))
    : [];
  const every = Array.isArray(raw.changeEverySec) ? raw.changeEverySec : [];
  const lo = num(every[0], d.changeEverySec[0], 1, 86400);
  const hi = num(every[1], d.changeEverySec[1], 1, 86400);
  const weights: Record<string, number> = {};
  const finalIds = ids.length > 0 ? ids : [...d.noteSetIds];
  const known = new Set(finalIds.flatMap((id) => NOTE_SETS[id]?.notes ?? []));
  if (isObj(raw.weights)) {
    for (const [note, w] of Object.entries(raw.weights)) {
      if (Object.keys(weights).length >= CAPS.maxWeightKeys) break;
      if (known.has(note) && typeof w === "number" && Number.isFinite(w)) {
        weights[note] = num(w, 1, CAPS.weight[0], CAPS.weight[1]);
      }
    }
  }
  return {
    id: raw.id,
    label: str(raw.label, d.label).slice(0, CAPS.labelMax),
    instrument: pick(raw.instrument, INSTRUMENTS, d.instrument),
    mode: pick(raw.mode, MODES, d.mode),
    noteSetIds: ids.length > 0 ? ids : [...d.noteSetIds],
    changeEverySec: [Math.min(lo, hi), Math.max(lo, hi)],
    weights,
    density: num(raw.density, d.density, 0, 1),
    brightness: num(raw.brightness, d.brightness, 0, 1),
    volumeDb: num(raw.volumeDb, d.volumeDb, CAPS.layerDb[0], CAPS.layerDb[1]),
    send: num(raw.send, d.send, 0, 1),
    muted: typeof raw.muted === "boolean" ? raw.muted : d.muted,
  };
}

function validTarget(target: unknown, layerIds: Set<string>): target is DriftTarget {
  if (typeof target !== "string") return false;
  if (BUS_TARGETS.includes(target)) return true;
  const parts = target.split(".");
  return parts.length === 3 && parts[0] === "layer" && layerIds.has(parts[1]) && LAYER_PARAMS.includes(parts[2]);
}

/** Drift ids end up in DOM attributes and selectors, so they are limited to a plain, short alphabet. */
export const DRIFT_ID = /^[A-Za-z0-9_-]{1,32}$/;

function normalizeDrifts(raw: unknown, layerIds: Set<string>): DriftSettings[] {
  if (!Array.isArray(raw)) return [];
  const out: DriftSettings[] = [];
  const seen = new Set<string>();
  // Every safe-looking id in the input, so a regenerated id can't collide with one or capture a modulatedBy.
  const reserved = new Set<string>();
  for (const r of raw) {
    if (!isObj(r)) continue;
    for (const v of [r.id, r.modulatedBy]) if (typeof v === "string" && DRIFT_ID.test(v)) reserved.add(v);
  }
  const renamed = new Map<string, string>();
  let next = 1;
  const freshId = () => {
    while (reserved.has(`drift${next}`)) next++;
    reserved.add(`drift${next}`);
    return `drift${next}`;
  };
  for (const r of raw) {
    if (out.length >= CAPS.maxDrifts) break;
    if (!isObj(r) || typeof r.id !== "string" || seen.has(r.id) || !validTarget(r.target, layerIds)) continue;
    seen.add(r.id);
    const id = DRIFT_ID.test(r.id) ? r.id : freshId();
    if (id !== r.id) renamed.set(r.id, id);
    out.push({
      id,
      target: r.target,
      periodSec: num(r.periodSec, 1000, 1, 86400),
      depth: num(r.depth, 0.5, 0, 1),
      enabled: typeof r.enabled === "boolean" ? r.enabled : true,
      modulatedBy: typeof r.modulatedBy === "string" ? r.modulatedBy : null,
    });
  }
  for (const d of out) {
    if (d.modulatedBy !== null) d.modulatedBy = renamed.get(d.modulatedBy) ?? d.modulatedBy;
  }
  const byId = new Map(out.map((d) => [d.id, d]));
  for (const d of out) {
    if (d.modulatedBy !== null && !byId.has(d.modulatedBy)) d.modulatedBy = null;
  }
  // break self-references and cycles
  for (const d of out) {
    let cur = d.modulatedBy;
    for (let hops = 0; cur !== null && hops <= out.length; hops++) {
      if (cur === d.id) { d.modulatedBy = null; break; }
      cur = byId.get(cur)?.modulatedBy ?? null;
    }
  }
  return out;
}

export function normalizeSettings(raw: unknown): StudioSettings {
  try {
    if (!isObj(raw) || raw.version !== 1) return structuredClone(DEFAULT_SETTINGS);
    const layers: LayerSettings[] = [];
    const seen = new Set<string>();
    for (const l of Array.isArray(raw.layers) ? raw.layers : []) {
      const n = normalizeLayer(l);
      if (layers.length >= CAPS.maxLayers) break;
      if (n && !seen.has(n.id)) { seen.add(n.id); layers.push(n); }
    }
    if (layers.length === 0) return structuredClone(DEFAULT_SETTINGS);
    const seed = Math.floor(num(raw.seed, DEFAULT_SETTINGS.seed, 1, CAPS.seedMax));
    return {
      version: 1,
      seed,
      mood: num(raw.mood, DEFAULT_SETTINGS.mood, 0, 1),
      masterDb: num(raw.masterDb, DEFAULT_SETTINGS.masterDb, CAPS.masterDb[0], CAPS.masterDb[1]),
      bus: normalizeBus(raw.bus),
      layers,
      drifts: normalizeDrifts(raw.drifts, new Set(layers.map((l) => l.id))),
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/**
 * Every level control at its cap, for the offline peak check. Piano layers become "keys": the offline render does
 * not load samples, so a synth stands in. `layerCount` (up to CAPS.maxLayers) repeats the default layers.
 */
export function extremeSettings(layerCount: number = DEFAULT_SETTINGS.layers.length): StudioSettings {
  const s = structuredClone(DEFAULT_SETTINGS);
  s.masterDb = CAPS.masterDb[1];
  s.bus.delayFeedback = CAPS.delayFeedbackMax;
  s.bus.delayWet = 1;
  s.bus.reverbSize = CAPS.reverbSizeMax;
  const base = s.layers;
  const count = Math.min(CAPS.maxLayers, Math.max(1, Math.floor(layerCount)));
  s.layers = Array.from({ length: count }, (_, i) => {
    const l = structuredClone(base[i % base.length]);
    if (i >= base.length) {
      l.id = `${l.id}${i}`;
      l.label = `${l.label} ${i}`;
    }
    return l;
  });
  for (const l of s.layers) {
    if (l.instrument === "piano") l.instrument = "keys";
    l.volumeDb = CAPS.layerDb[1];
    l.density = 1;
    l.brightness = 1;
    l.send = 1;
    l.muted = false;
  }
  s.drifts = [
    ...s.drifts.map((d) => ({ ...d, depth: 1, enabled: true })),
    { id: "size", target: "bus.reverbSize", periodSec: 60, depth: 1, enabled: true, modulatedBy: null },
  ];
  return s;
}
