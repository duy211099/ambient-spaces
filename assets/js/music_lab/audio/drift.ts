import * as Tone from "tone";
import { effectiveLayer } from "../mood.ts";
import type { Rng } from "../rng.ts";
import { CAPS, type DriftSettings, type DriftTarget, type StudioSettings } from "../settings.ts";
import { driftRange, sineAt } from "./drift-math.ts";
import { cutoffHz, REVERB_WET, type StudioGraph } from "./graph.ts";

const RESTORE_RAMP = 0.5;
const LAYER_TARGET = /^layer\.(.+)\.(brightness|volume|density)$/;

type Param = NonNullable<ReturnType<StudioGraph["param"]>>;

interface Active {
  target: DriftTarget;
  param: Param;
  periodSec: number;
  modulator: { id: string; periodSec: number } | null;
  lfo: Tone.LFO;
  mod: Tone.LFO | null;
  meter: Tone.Meter | null;
}

interface DensityDrift {
  target: DriftTarget;
  periodSec: number;
  depth: number;
  phase: number;
}

const layerOf = (target: DriftTarget): { id: string; param: string } | null => {
  const m = LAYER_TARGET.exec(target);
  return m ? { id: m[1], param: m[2] } : null;
};

/** The target's value with no drift, in the units of its Tone param. Null when the layer is gone. */
function baseValue(target: DriftTarget, s: StudioSettings): number | null {
  switch (target) {
    case "bus.reverbWet": return REVERB_WET;
    case "bus.reverbSize": return s.bus.reverbSize;
    case "bus.dampening": return s.bus.dampeningHz;
    case "bus.delayFeedback": return Math.min(CAPS.delayFeedbackMax, Math.max(0, s.bus.delayFeedback));
  }
  const l = layerOf(target);
  const layer = l && s.layers.find((x) => x.id === l.id);
  if (!l || !layer) return null;
  const eff = effectiveLayer(layer, s.mood);
  if (l.param === "brightness") return eff.brightness;
  if (l.param === "volume") return layer.volumeDb;
  return eff.density;
}

/** The LFO's min and max in the target param's units. */
function lfoRange(target: DriftTarget, base: number, depth: number): [number, number] {
  const [lo, hi] = driftRange(target, base, depth);
  return target.endsWith(".brightness") ? [cutoffHz(lo), cutoffHz(hi)] : [lo, hi];
}

/** Drops self-references and cycles: a drift modulated through a loop runs unmodulated. */
function modulatorOf(d: DriftSettings, byId: Map<string, DriftSettings>): DriftSettings | null {
  let cur = d.modulatedBy;
  for (let hops = 0; cur !== null && hops <= byId.size; hops++) {
    if (cur === d.id) return null;
    cur = byId.get(cur)?.modulatedBy ?? null;
  }
  if (cur !== null) return null;
  return d.modulatedBy === null ? null : (byId.get(d.modulatedBy) ?? null);
}

export class DriftRig {
  private graph: StudioGraph;
  private rng: Rng;
  private active = new Map<string, Active>();
  private phases = new Map<string, number>();
  private density = new Map<string, DensityDrift>();
  private settings: StudioSettings | null = null;

  constructor(graph: StudioGraph, rng: Rng) {
    this.graph = graph;
    this.rng = rng;
  }

  /** Brings the LFOs in line with `s`. Idempotent: only drifts whose shape changed are rebuilt. */
  apply(s: StudioSettings): void {
    this.settings = s;
    const byId = new Map(s.drifts.map((d) => [d.id, d]));
    const taken = new Set<DriftTarget>();
    const wanted = new Map<string, { d: DriftSettings; param: Param; mod: DriftSettings | null }>();
    this.density.clear();

    for (const d of s.drifts) {
      if (!d.enabled || taken.has(d.target)) continue; // one drift per target: two LFOs would add
      taken.add(d.target);
      const l = layerOf(d.target);
      if (l?.param === "density") {
        if (s.layers.some((x) => x.id === l.id)) {
          this.density.set(l.id, { target: d.target, periodSec: d.periodSec, depth: d.depth, phase: this.phaseDeg(d.id) * (Math.PI / 180) });
        }
        continue;
      }
      const param = this.graph.param(d.target);
      if (param) wanted.set(d.id, { d, param, mod: modulatorOf(d, byId) });
    }

    for (const [id, a] of [...this.active]) {
      const w = wanted.get(id);
      const same = w && w.d.target === a.target && w.param === a.param && w.d.periodSec === a.periodSec
        && (w.mod?.id ?? null) === (a.modulator?.id ?? null) && (w.mod?.periodSec ?? null) === (a.modulator?.periodSec ?? null);
      if (same) continue;
      this.release(id, !w || w.d.target !== a.target); // a rebuild on the same param is replaced at once and needs no restore
    }

    for (const [id, { d, param, mod }] of wanted) {
      const base = baseValue(d.target, s);
      if (base === null) continue;
      const [min, max] = lfoRange(d.target, base, d.depth);
      const existing = this.active.get(id);
      if (existing) {
        existing.lfo.min = min;
        existing.lfo.max = max;
        continue;
      }
      this.active.set(id, this.build(d, param, mod, min, max));
    }
  }

  /** Called as a layer is removed, before its channel ramps out: its params must stop being driven first. */
  dropLayer(layerId: string): void {
    for (const [id, a] of [...this.active]) {
      if (layerOf(a.target)?.id === layerId) this.release(id, false);
    }
    this.density.delete(layerId);
  }

  densityAt(layerId: string, base: number, t: number): number {
    const d = this.density.get(layerId);
    if (!d) return base;
    const [lo, hi] = driftRange(d.target, base, d.depth);
    return lo + (hi - lo) * sineAt(d.periodSec, d.phase, t);
  }

  /**
   * The LFO's live output for inspection. A driven param's own `.value` stays at its intrinsic 0, so the
   * LFO is metered instead. Only meaningful for targets in [0, 1] (reverb wet and size, feedback).
   */
  read(id: string): number | null {
    const a = this.active.get(id);
    if (!a) return null;
    if (!a.meter) {
      a.meter = new Tone.Meter({ smoothing: 0, normalRange: true });
      a.lfo.connect(a.meter);
      return null;
    }
    return Number(a.meter.getValue());
  }

  dispose(): void {
    for (const id of [...this.active.keys()]) this.release(id, false);
    this.density.clear();
  }

  private phaseDeg(id: string): number {
    let p = this.phases.get(id);
    if (p === undefined) {
      p = this.rng.fork(id).between(0, 360);
      this.phases.set(id, p);
    }
    return p;
  }

  private build(d: DriftSettings, param: Param, modBy: DriftSettings | null, min: number, max: number): Active {
    const frequency = 1 / d.periodSec;
    const lfo = new Tone.LFO({ min, max, frequency, phase: this.phaseDeg(d.id) });
    let mod: Tone.LFO | null = null;
    if (modBy) {
      // Drift-on-drift: the other drift's rhythm speeds this one up and slows it down, 0.5x to 2x.
      mod = new Tone.LFO({ min: frequency * 0.5, max: frequency * 2, frequency: 1 / modBy.periodSec, phase: this.phaseDeg(modBy.id) });
      mod.connect(lfo.frequency);
      mod.start();
    }
    this.graph.setDriven(d.target, true);
    const p = param as Tone.Param<any>;
    lfo.connect(p);
    // Tone zeroes the intrinsic value on connect, but a dB param converts that 0 to unity gain; force a true 0 so only the LFO sounds.
    p.overridden = true;
    p.cancelScheduledValues(0);
    p.setValueAtTime(0, 0);
    lfo.min = min; // units follow the destination once connected
    lfo.max = max;
    lfo.start();
    return { target: d.target, param, periodSec: d.periodSec, modulator: modBy ? { id: modBy.id, periodSec: modBy.periodSec } : null, lfo, mod, meter: null };
  }

  private release(id: string, restore: boolean): void {
    const a = this.active.get(id);
    if (!a) return;
    this.active.delete(id);
    a.lfo.stop();
    a.lfo.disconnect();
    a.lfo.dispose();
    a.meter?.dispose();
    a.mod?.stop();
    a.mod?.dispose();
    this.graph.setDriven(a.target, false);
    const base = this.settings ? baseValue(a.target, this.settings) : null;
    const p = a.param as Tone.Param<any>;
    p.overridden = false;
    if (restore && base !== null && this.graph.param(a.target) === a.param) {
      p.linearRampTo(a.target.endsWith(".brightness") ? cutoffHz(base) : base, RESTORE_RAMP);
    }
  }
}
