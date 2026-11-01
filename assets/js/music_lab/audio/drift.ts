import * as Tone from "tone";
import { effectiveLayer } from "../mood.ts";
import type { Rng } from "../rng.ts";
import { CAPS, type DriftSettings, type DriftTarget, type StudioSettings } from "../settings.ts";
import { centredRange, driftRange, sineAt } from "./drift-math.ts";
import { cutoffHz, REVERB_WET, type StudioGraph } from "./graph.ts";

const RESTORE_RAMP = 0.5;
type Release = "base" | "hold" | "none"; // ramp back to base, keep the LFO's last value, or leave the param alone
const LAYER_TARGET = /^layer\.(.+)\.(brightness|volume|density)$/;

type Param = NonNullable<ReturnType<StudioGraph["param"]>>;

interface Active {
  target: DriftTarget;
  param: Param;
  periodSec: number;
  modulator: { id: string; periodSec: number } | null;
  lfo: Tone.LFO;
  mod: Tone.LFO | null;
  analyser: Tone.Analyser;
  centred: boolean; // built mid-play: its range stays centred on the base instead of using the full legal span
}

/** The LFO's raw min and max. A centred drift narrows to the span that fits symmetrically around the live base. */
function sweepRange(p: Tone.Param<any>, target: DriftTarget, min: number, max: number, base: number, centred: boolean): [number, number] {
  const lo = rawOf(p, min);
  const hi = rawOf(p, max);
  return centred ? centredRange(lo, hi, rawOf(p, target.endsWith(".brightness") ? cutoffHz(base) : base)) : [lo, hi]; // gain sweeps linearly, not in dB
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

/** A value in the param's units as the raw number its audio signal carries (dB params take gain). */
const rawOf = (p: Tone.Param<any>, v: number): number => (p.units === "decibels" && p.convert ? Tone.dbToGain(v) : v);

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
  private started = false; // after the first apply, new drifts start at the current value instead of a seeded phase

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
      if (w && w.d.target === a.target && w.param === a.param) continue;
      // A stale param (reverb swapped) is left alone; a retargeted or dropped drift hands its old param back to base.
      this.release(id, w && w.d.target === a.target ? "none" : "base");
    }

    for (const [id, { d, param, mod }] of wanted) {
      const base = baseValue(d.target, s);
      if (base === null) continue;
      const [min, max] = lfoRange(d.target, base, d.depth);
      const existing = this.active.get(id);
      if (existing) this.retune(existing, d, mod, min, max, base);
      else this.active.set(id, this.build(d, param, mod, min, max, base));
    }
    this.started = true;
  }

  /** Called as a layer is removed, before its channel ramps out: its params must stop being driven first. */
  dropLayer(layerId: string): void {
    for (const [id, a] of [...this.active]) {
      if (layerOf(a.target)?.id === layerId) this.release(id, "hold"); // the channel's own fade-out takes over from here
    }
    this.density.delete(layerId);
  }

  densityAt(layerId: string, base: number, t: number): number {
    const d = this.density.get(layerId);
    if (!d) return base;
    const [lo, hi] = driftRange(d.target, base, d.depth);
    return lo + (hi - lo) * sineAt(d.periodSec, d.phase, t);
  }

  /** The LFO's latest output sample, in the param's raw units (gain for a dB param), or null when not driving. */
  read(id: string): number | null {
    const a = this.active.get(id);
    return a ? lastSample(a.analyser) : null;
  }

  dispose(): void {
    for (const id of [...this.active.keys()]) this.release(id, "none");
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

  private makeMod(lfo: Tone.LFO, frequency: number, modBy: DriftSettings): Tone.LFO {
    // Drift-on-drift: the other drift's rhythm speeds this one up and slows it down, 0.5x to 2x.
    const mod = new Tone.LFO({ min: frequency * 0.5, max: frequency * 2, frequency: 1 / modBy.periodSec, phase: this.phaseDeg(modBy.id) });
    mod.connect(lfo.frequency);
    mod.start();
    return mod;
  }

  private build(d: DriftSettings, param: Param, modBy: DriftSettings | null, min: number, max: number, base: number): Active {
    const frequency = 1 / d.periodSec;
    const p = param as Tone.Param<any>;
    // The LFO works in the raw signal domain and connects through its output, so Tone never re-converts its range
    // (which it does 100 ms late, leaving raw dB on a gain param for the first render quanta).
    // Enabled mid-play: centre the sweep on the live value at phase 0, so nothing steps. Tone's running oscillator
    // does not honour a non-zero phase at its first sample (measured: it lands at twice the offset), so the
    // range narrows to the span that fits symmetrically instead of starting off-centre.
    const centred = this.started;
    const [lo, hi] = sweepRange(p, d.target, min, max, base, centred);
    const phase = centred ? 0 : this.phaseDeg(d.id);
    const lfo = new Tone.LFO({ min: lo, max: hi, frequency, phase });
    const mod = modBy ? this.makeMod(lfo, frequency, modBy) : null;
    this.graph.setDriven(d.target, true);
    // Overridden first, so connect's own "zero the param" write is a true 0 (a dB param would otherwise be set to unity gain).
    p.overridden = true;
    lfo.start(Tone.immediate());
    p.cancelScheduledValues(0);
    p.setValueAtTime(0, 0);
    (lfo.output as Tone.ToneAudioNode).connect(p as any); // plain connect: Tone's LFO.connect would re-derive units from the param
    const analyser = new Tone.Analyser({ type: "waveform", size: 16 });
    lfo.connect(analyser);
    return { target: d.target, param, periodSec: d.periodSec, modulator: modBy ? { id: modBy.id, periodSec: modBy.periodSec } : null, lfo, mod, analyser, centred };
  }

  /** Retunes a running LFO in place so its phase, and so its output, stays continuous. */
  private retune(a: Active, d: DriftSettings, modBy: DriftSettings | null, min: number, max: number, base: number): void {
    [a.lfo.min, a.lfo.max] = sweepRange(a.param as Tone.Param<any>, a.target, min, max, base, a.centred);
    const f = 1 / d.periodSec;
    const periodChanged = a.periodSec !== d.periodSec;
    const sameMod = (a.modulator?.id ?? null) === (modBy?.id ?? null);
    a.periodSec = d.periodSec;
    if (!sameMod) {
      if (a.mod) {
        a.mod.stop();
        a.mod.output.disconnect();
        a.mod.dispose();
        a.mod = null;
        a.lfo.frequency.overridden = false;
      }
      if (modBy) a.mod = this.makeMod(a.lfo, f, modBy);
      else a.lfo.frequency.value = f;
    } else if (a.mod && modBy) {
      if (periodChanged) {
        a.mod.min = f * 0.5;
        a.mod.max = f * 2;
      }
      if (a.modulator?.periodSec !== modBy.periodSec) a.mod.frequency.value = 1 / modBy.periodSec;
    } else if (periodChanged) {
      a.lfo.frequency.value = f;
    }
    a.modulator = modBy ? { id: modBy.id, periodSec: modBy.periodSec } : null;
  }

  private release(id: string, mode: Release): void {
    const a = this.active.get(id);
    if (!a) return;
    this.active.delete(id);
    const p = a.param as Tone.Param<any>;
    const last = mode === "none" ? null : lastSample(a.analyser);
    a.lfo.stop();
    a.lfo.output.disconnect();
    a.lfo.dispose();
    a.analyser.dispose();
    a.mod?.stop();
    a.mod?.dispose();
    this.graph.setDriven(a.target, false);
    p.overridden = false;
    if (mode === "none" || this.graph.param(a.target) !== a.param) return;
    // Pick up exactly where the LFO left off, then glide to base (hold: stay there).
    p.cancelScheduledValues(0);
    if (last !== null) p.setValueAtTime(p.units === "decibels" && p.convert ? Tone.gainToDb(last) : last, Tone.now());
    const base = this.settings ? baseValue(a.target, this.settings) : null;
    if (mode === "base" && base !== null) p.linearRampTo(a.target.endsWith(".brightness") ? cutoffHz(base) : base, RESTORE_RAMP);
  }
}

function lastSample(analyser: Tone.Analyser): number | null {
  const v = analyser.getValue();
  const x = typeof v === "number" ? v : v[v.length - 1];
  return Number.isFinite(x) ? Number(x) : null;
}
