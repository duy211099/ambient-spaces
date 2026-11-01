import * as Tone from "tone";
import { effectiveLayer } from "../mood.ts";
import { createRng, type Rng } from "../rng.ts";
import { LayerScheduler, type Clock, type NoteEvent } from "../scheduler.ts";
import type { InstrumentId, LayerSettings, StudioSettings } from "../settings.ts";
import { DriftRig } from "./drift.ts";
import { StudioGraph } from "./graph.ts";
import { makeInstrument, noteLength, type Instrument } from "./instruments.ts";

const START_LEAD = 0.1;
const DISPOSE_AFTER_MS = 8000;

type Transport = ReturnType<typeof Tone.getTransport>;

/** The scheduler works in Transport seconds; the callback ignores Tone's audio time on purpose. */
export function toneClock(transport: Transport): Clock {
  return {
    now: () => transport.seconds,
    scheduleOnce: (cb, at) => transport.scheduleOnce(() => cb(at), at),
    clear: (id) => transport.clear(id),
  };
}

interface Voice {
  layer: LayerSettings;
  instrumentId: InstrumentId;
  instrument: Instrument;
  rng: Rng;
  scheduler: LayerScheduler;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class StudioEngine {
  private onNote: (e: NoteEvent & { layerIndex: number }) => void;
  private graph: StudioGraph | null = null;
  private rig: DriftRig | null = null;
  private voices = new Map<string, Voice>();
  private settings: StudioSettings | null = null;
  private clock: Clock = toneClock(Tone.getTransport());
  private t0 = 0;
  private isPlaying = false;
  private token = 0;
  private starting = false;

  constructor(onNote: (e: NoteEvent & { layerIndex: number }) => void) {
    this.onNote = onNote;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get output(): Tone.ToneAudioNode {
    if (!this.graph) throw new Error("engine not started");
    return this.graph.output;
  }

  get drift(): DriftRig | null {
    return this.rig;
  }

  get studioGraph(): StudioGraph | null {
    return this.graph;
  }

  async start(s: StudioSettings): Promise<void> {
    if (this.isPlaying || this.starting) return;
    this.starting = true;
    const token = ++this.token;
    try {
      await Tone.start();
      if (token !== this.token) return; // stopped during the gesture wait
      const graph = new StudioGraph(s);
      this.graph = graph;
      this.rig = new DriftRig(graph, createRng(s.seed).fork("drift"));
      this.rig.apply(s);
      this.settings = structuredClone(s);
      this.isPlaying = true;
      for (const l of s.layers) this.voices.set(l.id, this.makeVoice(l, s.seed));
      await Promise.all([graph.ready(), Tone.loaded()]);
      if (token !== this.token) return; // stopped while loading
      for (const v of this.voices.values()) v.scheduler.start(v.layer);
      const transport = Tone.getTransport();
      this.t0 = Tone.now() + START_LEAD;
      transport.start(this.t0, 0);
    } catch (err) {
      if (token === this.token) this.stop();
      throw err;
    } finally {
      this.starting = false;
    }
  }

  apply(next: StudioSettings): void {
    const graph = this.graph;
    const prev = this.settings;
    if (!graph || !prev || !this.isPlaying) return;
    const s = structuredClone(next);
    const seedChanged = s.seed !== prev.seed;
    this.settings = s; // new layers' schedulers read the mood from here

    for (const id of [...this.voices.keys()]) {
      if (!s.layers.some((l) => l.id === id)) {
        this.disposeVoice(this.voices.get(id)!, true);
        this.voices.delete(id);
        this.rig?.dropLayer(id);
        graph.removeLayer(id);
      }
    }

    graph.applyMood(s.mood);
    for (const l of s.layers) {
      const voice = this.voices.get(l.id);
      if (!voice) {
        graph.addLayer(l);
        const v = this.makeVoice(l, s.seed);
        this.voices.set(l.id, v);
        v.scheduler.start(l);
        continue;
      }
      const old = voice.layer;
      if (seedChanged) {
        voice.scheduler.stop();
        voice.rng = createRng(s.seed).fork(l.id);
        voice.scheduler = this.makeScheduler(voice.rng);
        voice.layer = l;
        voice.scheduler.start(l);
      } else if (old.mode !== l.mode || !sameJson(old.noteSetIds, l.noteSetIds) || !sameJson(old.changeEverySec, l.changeEverySec)) {
        voice.layer = l;
        voice.scheduler.reconfigure(l);
      } else {
        voice.layer = l;
        voice.scheduler.update(l);
      }
      if (old.instrument !== l.instrument) this.swapInstrument(voice, l.instrument);
    }

    if (s.masterDb !== prev.masterDb) graph.applyMaster(s.masterDb);
    if (!sameJson(s.bus, prev.bus)) graph.applyBus(s.bus);
    for (const l of s.layers) graph.applyLayer(l, effectiveLayer(l, s.mood));
    this.rig?.apply(s);
  }

  stop(): void {
    this.token++;
    if (!this.isPlaying) return;
    this.isPlaying = false;
    const transport = Tone.getTransport();
    for (const v of this.voices.values()) {
      v.scheduler.stop();
      this.disposeVoice(v, false);
    }
    this.voices.clear();
    transport.stop();
    transport.cancel(0);
    const graph = this.graph;
    const rig = this.rig;
    this.graph = null;
    this.rig = null;
    this.settings = null;
    if (graph) {
      setTimeout(() => {
        rig?.dispose();
        graph.dispose();
      }, DISPOSE_AFTER_MS);
    }
  }

  private makeScheduler(rng: Rng): LayerScheduler {
    return new LayerScheduler(
      this.clock,
      rng,
      (e) => this.play(e),
      () => this.settings?.mood ?? 0.5,
      (l, t) => {
        const base = effectiveLayer(l, this.settings?.mood ?? 0.5).density;
        return this.rig ? this.rig.densityAt(l.id, base, t) : base;
      },
    );
  }

  private makeVoice(l: LayerSettings, seed: number): Voice {
    const rng = createRng(seed).fork(l.id);
    const instrument = makeInstrument(l.instrument);
    instrument.connect(this.graph!.layerInput(l.id));
    return { layer: l, instrumentId: l.instrument, instrument, rng, scheduler: this.makeScheduler(rng) };
  }

  private swapInstrument(voice: Voice, id: InstrumentId): void {
    const old = voice.instrument;
    old.releaseAll();
    voice.instrument = makeInstrument(id);
    voice.instrument.connect(this.graph!.layerInput(voice.layer.id));
    voice.instrumentId = id;
    setTimeout(() => old.dispose(), DISPOSE_AFTER_MS);
  }

  private disposeVoice(v: Voice, stopScheduler: boolean): void {
    if (stopScheduler) v.scheduler.stop();
    v.instrument.releaseAll();
    const inst = v.instrument;
    setTimeout(() => inst.dispose(), DISPOSE_AFTER_MS);
  }

  private play(e: NoteEvent): void {
    const voice = this.voices.get(e.layerId);
    if (!voice || !this.settings) return;
    // A sampler swapped in while playing has no buffers yet; its next note plays once they arrive.
    if (voice.instrument instanceof Tone.Sampler && !voice.instrument.loaded) return;
    const audioTime = this.t0 + e.time;
    voice.instrument.triggerAttackRelease(e.note, noteLength(voice.instrumentId, voice.rng), audioTime, e.velocity);
    const layerIndex = this.settings.layers.findIndex((l) => l.id === e.layerId);
    const token = this.token;
    Tone.getDraw().schedule(() => {
      if (token === this.token && this.isPlaying) this.onNote({ ...e, layerIndex });
    }, audioTime);
  }
}
