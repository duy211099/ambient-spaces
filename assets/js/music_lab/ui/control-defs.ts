import { NOTE_SETS } from "../notesets.ts";
import { PIANO_SAMPLES } from "../piano.ts";
import { CAPS, type DriftSettings, type DriftTarget, type LayerSettings, type StudioSettings } from "../settings.ts";

export interface ControlDef {
  id: string;
  label: string;
  kind: "range" | "select" | "toggle" | "number";
  scope: "global" | "bus" | "layer";
  path: string; // dot path into StudioSettings, or into LayerSettings for scope "layer"
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
  guide: string;
}

export const GUIDE_IDS = [
  "mood", "master", "seed", "reverb-kind", "reverb", "dampening", "delay", "feedback",
  "instrument", "timing-eno", "timing-random-once", "timing-random-every", "note-set",
  "chord-changes", "density", "brightness", "volume", "send", "mute", "weights", "layers",
  "drift", "drift-on-drift", "scheduling-time", "sampler", "oscillator",
] as const;

/** The mode control's guide entry depends on the selected mode. */
export const MODE_GUIDES: Record<string, string> = {
  eno: "timing-eno",
  randomOnce: "timing-random-once",
  randomEvery: "timing-random-every",
};

const noteSetOptions = (): Record<string, string> =>
  Object.fromEntries(Object.entries(NOTE_SETS).map(([id, s]) => [id, s.label]));

export const CONTROL_DEFS: ControlDef[] = [
  { id: "mood", label: "Mood (calm to busy)", kind: "range", scope: "global", path: "mood", min: 0, max: 1, step: 0.01, guide: "mood" },
  { id: "masterDb", label: "Master volume (dB)", kind: "range", scope: "global", path: "masterDb", min: CAPS.masterDb[0], max: CAPS.masterDb[1], step: 1, guide: "master" },
  { id: "seed", label: "Seed", kind: "number", scope: "global", path: "seed", min: 1, max: CAPS.seedMax, step: 1, guide: "seed" },

  { id: "reverbKind", label: "Reverb type", kind: "select", scope: "bus", path: "bus.reverbKind", options: { freeverb: "Freeverb", convolver: "Convolver" }, guide: "reverb-kind" },
  { id: "reverbSize", label: "Reverb size", kind: "range", scope: "bus", path: "bus.reverbSize", min: 0, max: 1, step: 0.01, guide: "reverb" },
  { id: "dampeningHz", label: "Dampening (Hz)", kind: "range", scope: "bus", path: "bus.dampeningHz", min: 200, max: 20000, step: 100, guide: "dampening" },
  { id: "delayTime", label: "Delay time (s)", kind: "range", scope: "bus", path: "bus.delayTime", min: 0.05, max: 1, step: 0.01, guide: "delay" },
  { id: "delayFeedback", label: "Delay feedback", kind: "range", scope: "bus", path: "bus.delayFeedback", min: 0, max: CAPS.delayFeedbackMax, step: 0.01, guide: "feedback" },
  { id: "delayWet", label: "Delay mix", kind: "range", scope: "bus", path: "bus.delayWet", min: 0, max: 1, step: 0.01, guide: "delay" },

  {
    id: "instrument", label: "Instrument", kind: "select", scope: "layer", path: "instrument",
    options: { piano: PIANO_SAMPLES ? "Soft piano" : "Piano (samples not installed)", keys: "Keys", pad: "Warm pad", bell: "Temple bell", tone: "Pure tone" },
    guide: "instrument",
  },
  {
    id: "mode", label: "Timing", kind: "select", scope: "layer", path: "mode",
    options: { eno: "Eno loops", randomOnce: "Random, fixed", randomEvery: "Random, every time" },
    guide: "timing-eno",
  },
  { id: "noteSet", label: "Notes", kind: "select", scope: "layer", path: "noteSetIds.0", options: noteSetOptions(), guide: "note-set" },
  { id: "chordChanges", label: "Chord changes", kind: "toggle", scope: "layer", path: "noteSetIds.length", guide: "chord-changes" },
  { id: "density", label: "Sparser to busier", kind: "range", scope: "layer", path: "density", min: 0, max: 1, step: 0.01, guide: "density" },
  { id: "brightness", label: "Darker to brighter", kind: "range", scope: "layer", path: "brightness", min: 0, max: 1, step: 0.01, guide: "brightness" },
  { id: "volumeDb", label: "Volume (dB)", kind: "range", scope: "layer", path: "volumeDb", min: CAPS.layerDb[0], max: CAPS.layerDb[1], step: 1, guide: "volume" },
  { id: "send", label: "Echo and reverb send", kind: "range", scope: "layer", path: "send", min: 0, max: 1, step: 0.01, guide: "send" },
  { id: "muted", label: "Mute", kind: "toggle", scope: "layer", path: "muted", guide: "mute" },
];

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Immutable: copies each container along the path and leaves `obj` untouched. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const go = (cur: unknown, i: number): unknown => {
    if (i === keys.length) return value;
    const base: Record<string, unknown> | unknown[] = Array.isArray(cur)
      ? [...cur]
      : { ...((cur ?? {}) as Record<string, unknown>) };
    (base as Record<string, unknown>)[keys[i]] = go((cur as Record<string, unknown> | undefined)?.[keys[i]], i + 1);
    return base;
  };
  return go(obj, 0) as T;
}

/** Notes of every set the layer uses, in set order, without repeats. */
export function layerNotes(layer: LayerSettings): string[] {
  const out: string[] = [];
  for (const id of layer.noteSetIds) {
    for (const n of NOTE_SETS[id]?.notes ?? []) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** The value a control shows for a layer or for the whole settings. */
export function readControl(def: ControlDef, s: StudioSettings, layer?: LayerSettings): unknown {
  const v = getPath(def.scope === "layer" ? layer : s, def.path);
  if (def.id === "chordChanges") return (v as number) > 1;
  return v ?? (def.id.startsWith("weight-") ? 1 : undefined);
}

/** The first set in NOTE_SETS order that isn't `current`. */
function nextAfter(current: string): string {
  return Object.keys(NOTE_SETS).find((id) => id !== current) ?? current;
}

export function applyLayerValue(layer: LayerSettings, def: ControlDef, value: unknown): LayerSettings {
  if (def.id === "chordChanges") {
    const first = layer.noteSetIds[0];
    return { ...layer, noteSetIds: value ? [first, nextAfter(first)] : [first] };
  }
  if (def.id === "noteSet") {
    const ids = [...layer.noteSetIds];
    ids[0] = value as string;
    if (ids.length > 1 && ids[1] === ids[0]) ids[1] = nextAfter(ids[0]);
    return { ...layer, noteSetIds: ids };
  }
  return setPath(layer, def.path, value);
}

export const MAX_LAYERS = CAPS.maxLayers;

/** Appends a copy of the "notes" layer (or the first) with a fresh id and label. */
export function addLayer(s: StudioSettings): StudioSettings {
  if (s.layers.length >= MAX_LAYERS) return s;
  const base = s.layers.find((l) => l.id === "notes") ?? s.layers[0];
  let n = s.layers.length + 1;
  while (s.layers.some((l) => l.id === `layer${n}`)) n++;
  const copy: LayerSettings = { ...structuredClone(base), id: `layer${n}`, label: `Layer ${n}` };
  return { ...s, layers: [...s.layers, copy] };
}

export function removeLayer(s: StudioSettings, id: string): StudioSettings {
  if (s.layers.length <= 1) return s;
  const layers = s.layers.filter((l) => l.id !== id);
  const drifts = s.drifts.filter((d) => !d.target.startsWith(`layer.${id}.`));
  const gone = new Set(s.drifts.filter((d) => !drifts.includes(d)).map((d) => d.id));
  return { ...s, layers, drifts: drifts.map((d) => (d.modulatedBy !== null && gone.has(d.modulatedBy) ? { ...d, modulatedBy: null } : d)) };
}

export const weightDef = (note: string): ControlDef => ({
  id: `weight-${note}`, label: note, kind: "range", scope: "layer", path: `weights.${note}`,
  min: CAPS.weight[0], max: CAPS.weight[1], step: 0.05, guide: "weights",
});

export function getWeight(layer: LayerSettings, note: string): number {
  return layer.weights[note] ?? 1;
}

export function setWeight(s: StudioSettings, layerId: string, note: string, value: number): StudioSettings {
  const idx = s.layers.findIndex((l) => l.id === layerId);
  return idx < 0 ? s : setPath(s, `layers.${idx}.weights.${note}`, value);
}

export function applyControl(s: StudioSettings, def: ControlDef, value: unknown, layerIndex = 0): StudioSettings {
  if (def.scope !== "layer") return setPath(s, def.path, value);
  const layers = s.layers.map((l, i) => (i === layerIndex ? applyLayerValue(l, def, value) : l));
  return { ...s, layers };
}

export const MAX_DRIFTS = 12;

const BUS_DRIFT_TARGETS: Record<string, string> = {
  "bus.reverbWet": "Reverb amount",
  "bus.reverbSize": "Reverb size",
  "bus.dampening": "Dampening",
  "bus.delayFeedback": "Echo feedback",
};
const LAYER_DRIFT_PARAMS: Record<string, string> = { brightness: "brightness", volume: "volume", density: "density" };

/** Every target a drift can move, with a readable label. */
export function driftTargets(s: StudioSettings): Record<string, string> {
  const out: Record<string, string> = { ...BUS_DRIFT_TARGETS };
  for (const l of s.layers) {
    for (const [param, label] of Object.entries(LAYER_DRIFT_PARAMS)) out[`layer.${l.id}.${param}`] = `${l.label} ${label}`;
  }
  return out;
}

/** Appends a drift on the first target nothing drifts yet (or the reverb amount). */
export function addDrift(s: StudioSettings): StudioSettings {
  if (s.drifts.length >= MAX_DRIFTS) return s;
  let n = s.drifts.length + 1;
  while (s.drifts.some((d) => d.id === `drift${n}`)) n++;
  const used = new Set(s.drifts.map((d) => d.target));
  const target = (Object.keys(driftTargets(s)).find((t) => !used.has(t as DriftTarget)) ?? "bus.reverbWet") as DriftTarget;
  const drift: DriftSettings = { id: `drift${n}`, target, periodSec: 60, depth: 0.5, enabled: true, modulatedBy: null };
  return { ...s, drifts: [...s.drifts, drift] };
}

/** Removes a drift and frees any drift it modulated. */
export function removeDrift(s: StudioSettings, id: string): StudioSettings {
  const drifts = s.drifts
    .filter((d) => d.id !== id)
    .map((d) => (d.modulatedBy === id ? { ...d, modulatedBy: null } : d));
  return { ...s, drifts };
}

export function updateDrift(s: StudioSettings, id: string, patch: Partial<Omit<DriftSettings, "id">>): StudioSettings {
  return { ...s, drifts: s.drifts.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}
