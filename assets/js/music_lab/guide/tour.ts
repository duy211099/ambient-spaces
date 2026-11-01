import { CAPS, DEFAULT_SETTINGS, type DriftSettings, type LayerSettings, type StudioSettings } from "../settings.ts";

export interface TourStep {
  entryId: string;
  focus: string | null; // a ControlDef.id; null highlights the control whose ⓘ shows the entry
  apply: (s: StudioSettings) => StudioSettings;
}

/** The layer the tour builds up. */
export const TOUR_LAYER = "notes";
const REVERB_DRIFT = "tour-reverb";
const WOBBLE_DRIFT = "tour-wobble";

/** Makes sure a "notes" layer exists (taking the last slot if the studio is full). */
function ensureNotesLayer(s: StudioSettings): StudioSettings {
  if (s.layers.some((l) => l.id === TOUR_LAYER)) return s;
  const fresh = structuredClone(DEFAULT_SETTINGS.layers.find((l) => l.id === TOUR_LAYER)!);
  const kept = s.layers.length >= CAPS.maxLayers ? s.layers.slice(0, -1) : s.layers;
  const gone = new Set(s.layers.filter((l) => !kept.includes(l)).map((l) => l.id));
  const drifts = s.drifts.filter((d) => !gone.has(d.target.split(".")[1] ?? ""));
  const ids = new Set(drifts.map((d) => d.id));
  return {
    ...s,
    layers: [...kept, fresh],
    drifts: drifts.map((d) => (d.modulatedBy !== null && !ids.has(d.modulatedBy) ? { ...d, modulatedBy: null } : d)),
  };
}

const onNotes = (patch: Partial<LayerSettings>) => (s: StudioSettings): StudioSettings => ({
  ...s,
  layers: s.layers.map((l) => (l.id === TOUR_LAYER ? { ...l, ...patch } : l)),
});

const freeId = (s: StudioSettings, base: string): string => {
  let id = base;
  for (let n = 2; s.drifts.some((d) => d.id === id); n++) id = `${base}${n}`;
  return id;
};

/** The first drift on the reverb amount; only that one takes effect. */
const reverbDrift = (s: StudioSettings): DriftSettings | undefined => s.drifts.find((d) => d.target === "bus.reverbWet");

function withReverbDrift(s: StudioSettings): StudioSettings {
  const existing = reverbDrift(s);
  if (existing) {
    return { ...s, drifts: s.drifts.map((d) => (d === existing ? { ...d, enabled: true, depth: Math.max(d.depth, 0.6) } : d)) };
  }
  if (s.drifts.length >= CAPS.maxDrifts) return s;
  const drift: DriftSettings = { id: freeId(s, REVERB_DRIFT), target: "bus.reverbWet", periodSec: 120, depth: 0.7, enabled: true, modulatedBy: null };
  return { ...s, drifts: [...s.drifts, drift] };
}

function withDriftOnDrift(s: StudioSettings): StudioSettings {
  const reverb = reverbDrift(s);
  if (!reverb || s.drifts.length >= CAPS.maxDrifts) return s;
  const target = `layer.${TOUR_LAYER}.brightness` as const;
  const taken = s.drifts.some((d) => d.target === target);
  const wobble: DriftSettings = {
    id: freeId(s, WOBBLE_DRIFT), target: taken ? "bus.dampening" : target, periodSec: 300, depth: 0.4, enabled: true, modulatedBy: null,
  };
  if (s.drifts.some((d) => d.target === wobble.target)) return s;
  const drifts = s.drifts.map((d) => (d === reverb ? { ...d, modulatedBy: wobble.id } : d));
  return { ...s, drifts: [...drifts, wobble] };
}

export const TOUR_STEPS: TourStep[] = [
  {
    entryId: "layers", focus: "muted",
    apply: (s) => {
      const n = ensureNotesLayer(s);
      return { ...n, layers: n.layers.map((l) => ({ ...l, muted: true })) };
    },
  },
  {
    entryId: "oscillator", focus: "instrument",
    apply: onNotes({ muted: false, instrument: "tone", noteSetIds: ["single"], weights: {}, mode: "randomEvery", density: 0.5, send: 0.15 }),
  },
  { entryId: "sampler", focus: "instrument", apply: onNotes({ instrument: "piano" }) },
  { entryId: "scheduling-time", focus: "density", apply: onNotes({ density: 0.7 }) },
  { entryId: "timing-eno", focus: "mode", apply: onNotes({ noteSetIds: ["airports"], mode: "eno", density: 0.5 }) },
  { entryId: "timing-random-once", focus: "mode", apply: onNotes({ mode: "randomOnce" }) },
  { entryId: "timing-random-every", focus: "mode", apply: onNotes({ mode: "randomEvery" }) },
  { entryId: "reverb", focus: "send", apply: onNotes({ send: 0.7 }) },
  { entryId: "drift", focus: null, apply: withReverbDrift },
  { entryId: "weights", focus: null, apply: onNotes({ weights: { F4: 3, C5: 2 } }) },
  { entryId: "chord-changes", focus: "chordChanges", apply: onNotes({ noteSetIds: ["airports", "airportsAlt"], changeEverySec: [40, 90] }) },
  { entryId: "layers", focus: "muted", apply: (s) => ({ ...s, layers: s.layers.map((l) => ({ ...l, muted: false })) }) },
  { entryId: "drift-on-drift", focus: null, apply: withDriftOnDrift },
  { entryId: "mood", focus: "mood", apply: (s) => ({ ...s, mood: 0.3 }) },
  { entryId: "seed", focus: "seed", apply: (s) => s },
];
