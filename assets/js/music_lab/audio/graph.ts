import * as Tone from "tone";
import { effectiveLayer, type EffectiveLayer } from "../mood.ts";
import { CAPS, type BusSettings, type DriftTarget, type LayerSettings, type StudioSettings } from "../settings.ts";

const RAMP = 0.3;
const LAYER_FADE = 2;
const DISPOSE_AFTER_MS = 8000;
const REVERB_WET = 0.5;
// Freeverb's one-pole damping goes unstable above ~sampleRate/pi, so keep it well under that.
const FREEVERB_DAMPENING_HZ = 10000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const cutoffHz = (brightness: number) => 300 * Math.pow(2, 6 * brightness);
const layerDb = (db: number) => clamp(db, CAPS.layerDb[0], CAPS.layerDb[1]);
const masterDb = (db: number) => clamp(db, CAPS.masterDb[0], CAPS.masterDb[1]);
const feedback = (f: number) => clamp(f, 0, CAPS.delayFeedbackMax);

type Reverb = Tone.Freeverb | Tone.Reverb;
type DriftParam = Tone.Param<any> | Tone.Signal<any>;

interface Channel {
  filter: Tone.Filter;
  volume: Tone.Volume;
  send: Tone.Gain;
}

export class StudioGraph {
  readonly master: Tone.Gain;
  readonly output: Tone.ToneAudioNode;

  private masterVolume: Tone.Volume;
  private limiter: Tone.Limiter;
  private delay: Tone.FeedbackDelay;
  private damp: Tone.Filter;
  private reverb: Reverb;
  private reverbKind: BusSettings["reverbKind"];
  private channels = new Map<string, Channel>();
  private mood: number;

  constructor(s: StudioSettings) {
    this.mood = s.mood;
    this.limiter = new Tone.Limiter(CAPS.limiterDb);
    this.limiter.toDestination();
    this.output = this.limiter;
    this.masterVolume = new Tone.Volume(masterDb(s.masterDb));
    this.masterVolume.connect(this.limiter);
    this.master = new Tone.Gain(1);
    this.master.connect(this.masterVolume);

    this.delay = new Tone.FeedbackDelay({
      delayTime: s.bus.delayTime,
      feedback: feedback(s.bus.delayFeedback),
      wet: s.bus.delayWet,
    });
    this.damp = new Tone.Filter({
      type: "lowpass",
      frequency: s.bus.dampeningHz,
      Q: CAPS.filterQMax,
      rolloff: -12,
    });
    this.reverbKind = s.bus.reverbKind;
    this.reverb = this.makeReverb(s.bus);
    this.delay.connect(this.damp);
    this.damp.connect(this.reverb);
    this.reverb.connect(this.master);

    for (const l of s.layers) this.addLayer(l);
  }

  /** Resolves once the convolver impulse response (if any) is generated. */
  ready(): Promise<void> {
    return this.reverb instanceof Tone.Reverb ? this.reverb.ready.then(() => undefined) : Promise.resolve();
  }

  layerInput(id: string): Tone.ToneAudioNode {
    const ch = this.channels.get(id);
    if (!ch) throw new Error(`unknown layer ${id}`);
    return ch.filter;
  }

  addLayer(l: LayerSettings): void {
    if (this.channels.has(l.id)) return;
    const eff = effectiveLayer(l, this.mood);
    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: cutoffHz(eff.brightness),
      Q: CAPS.filterQMax,
      rolloff: -12,
    });
    const volume = new Tone.Volume(layerDb(l.volumeDb));
    const send = new Tone.Gain(eff.send);
    filter.connect(volume);
    volume.connect(this.master);
    volume.connect(send);
    send.connect(this.delay);
    this.channels.set(l.id, { filter, volume, send });
  }

  /** Fades the channel out, then disposes it once the instrument's tail is gone. */
  removeLayer(id: string, immediate = false): void {
    const ch = this.channels.get(id);
    if (!ch) return;
    this.channels.delete(id);
    const dispose = () => {
      ch.filter.dispose();
      ch.volume.dispose();
      ch.send.dispose();
    };
    if (immediate) return dispose();
    ch.volume.volume.rampTo(-100, LAYER_FADE);
    setTimeout(dispose, DISPOSE_AFTER_MS);
  }

  applyLayer(l: LayerSettings, eff: EffectiveLayer): void {
    const ch = this.channels.get(l.id);
    if (!ch) return;
    ch.filter.frequency.rampTo(cutoffHz(eff.brightness), RAMP);
    ch.volume.volume.rampTo(layerDb(l.volumeDb), RAMP);
    ch.send.gain.rampTo(clamp(eff.send, 0, 1), RAMP);
  }

  applyMood(mood: number): void {
    this.mood = mood;
  }

  applyMaster(db: number): void {
    this.masterVolume.volume.rampTo(masterDb(db), RAMP);
  }

  applyBus(b: BusSettings): void {
    this.delay.delayTime.rampTo(b.delayTime, RAMP);
    this.delay.feedback.rampTo(feedback(b.delayFeedback), RAMP);
    this.delay.wet.rampTo(b.delayWet, RAMP);
    this.damp.frequency.rampTo(b.dampeningHz, RAMP);
    if (b.reverbKind !== this.reverbKind) {
      const old = this.reverb;
      this.reverbKind = b.reverbKind;
      this.reverb = this.makeReverb(b);
      this.damp.disconnect(old);
      this.damp.connect(this.reverb);
      this.reverb.connect(this.master);
      setTimeout(() => old.dispose(), DISPOSE_AFTER_MS);
    } else if (this.reverb instanceof Tone.Freeverb) {
      this.reverb.roomSize.rampTo(b.reverbSize, RAMP);
    } else {
      this.reverb.decay = convolverDecay(b.reverbSize);
    }
  }

  /** The Tone param a drift target modulates, or null when it has none (density lives in the scheduler). */
  param(target: DriftTarget): DriftParam | null {
    switch (target) {
      case "bus.reverbWet":
        return this.reverb.wet;
      case "bus.reverbSize":
        return this.reverb instanceof Tone.Freeverb ? this.reverb.roomSize : null;
      case "bus.dampening":
        return this.damp.frequency;
      case "bus.delayFeedback":
        return this.delay.feedback;
    }
    const m = /^layer\.(.+)\.(brightness|volume|density)$/.exec(target);
    if (!m) return null;
    const ch = this.channels.get(m[1]);
    if (!ch) return null;
    if (m[2] === "brightness") return ch.filter.frequency;
    if (m[2] === "volume") return ch.volume.volume;
    return null;
  }

  dispose(): void {
    for (const id of [...this.channels.keys()]) this.removeLayer(id, true);
    this.delay.dispose();
    this.damp.dispose();
    this.reverb.dispose();
    this.master.dispose();
    this.masterVolume.dispose();
    this.limiter.dispose();
  }

  private makeReverb(b: BusSettings): Reverb {
    if (b.reverbKind === "freeverb") {
      return new Tone.Freeverb({ roomSize: b.reverbSize, dampening: FREEVERB_DAMPENING_HZ, wet: REVERB_WET });
    }
    return new Tone.Reverb({ decay: convolverDecay(b.reverbSize), preDelay: 0.05, wet: REVERB_WET });
  }
}

const convolverDecay = (size: number) => 1 + clamp(size, 0, 1) * 14;
