import * as Tone from "tone";
import { effectiveLayer, type EffectiveLayer } from "../mood.ts";
import { CAPS, type BusSettings, type DriftTarget, type LayerSettings, type StudioSettings } from "../settings.ts";
import { layerHeadroomGain, SOFT_CLIP_RANGE, softClipCurve } from "./softclip.ts";

const RAMP = 0.3;
const LAYER_FADE = 2;
const DISPOSE_AFTER_MS = 8000;
const DECAY_DEBOUNCE_MS = 250;
export const REVERB_WET = 0.5;
// Freeverb's one-pole damping goes unstable above ~sampleRate/pi, so keep it well under that.
const FREEVERB_DAMPENING_HZ = 10000;
const SOFT_CLIP_POINTS = 8193;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const cutoffHz = (brightness: number) => 300 * Math.pow(2, 6 * brightness);
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
  private clipScale: Tone.Gain;
  private clip: Tone.WaveShaper;
  private delay: Tone.FeedbackDelay;
  private damp: Tone.Filter;
  private reverb: Reverb;
  private reverbKind: BusSettings["reverbKind"];
  private channels = new Map<string, Channel>();
  private mood: number;
  private decayTimer: ReturnType<typeof setTimeout> | undefined;
  // Targets a drift LFO is connected to; their raw params must not be ramped (the ramp would add to the LFO).
  private driven = new Set<DriftTarget>();

  constructor(s: StudioSettings) {
    this.mood = s.mood;
    // Tone's Limiter is a soft-knee compressor that lets fast peaks through, so a soft clip after it is the real
    // ceiling: identity below about -6 dBFS, never reaching full scale above it.
    this.clip = new Tone.WaveShaper(softClipCurve(SOFT_CLIP_POINTS));
    this.clip.toDestination();
    this.clipScale = new Tone.Gain(1 / SOFT_CLIP_RANGE);
    this.clipScale.connect(this.clip);
    this.limiter = new Tone.Limiter(CAPS.limiterDb);
    this.limiter.connect(this.clipScale);
    this.output = this.clip;
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
    this.master.gain.value = layerHeadroomGain(this.channels.size);
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
    this.applyHeadroom();
  }

  /** `master` carries the layer-count trim (see layerHeadroomGain), faded with the layer it follows. */
  private applyHeadroom(): void {
    this.master.gain.rampTo(layerHeadroomGain(this.channels.size), LAYER_FADE);
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
    this.applyHeadroom();
    ch.volume.volume.rampTo(-100, LAYER_FADE);
    setTimeout(dispose, DISPOSE_AFTER_MS);
  }

  applyLayer(l: LayerSettings, eff: EffectiveLayer): void {
    const ch = this.channels.get(l.id);
    if (!ch) return;
    if (!this.driven.has(`layer.${l.id}.brightness`)) ch.filter.frequency.rampTo(cutoffHz(eff.brightness), RAMP);
    if (!this.driven.has(`layer.${l.id}.volume`)) ch.volume.volume.rampTo(layerDb(l.volumeDb), RAMP);
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
    if (!this.driven.has("bus.delayFeedback")) this.delay.feedback.rampTo(feedback(b.delayFeedback), RAMP);
    this.delay.wet.rampTo(b.delayWet, RAMP);
    if (!this.driven.has("bus.dampening")) this.damp.frequency.rampTo(b.dampeningHz, RAMP);
    if (b.reverbKind !== this.reverbKind) {
      const old = this.reverb;
      this.reverbKind = b.reverbKind;
      this.driven.delete("bus.reverbWet");
      this.driven.delete("bus.reverbSize");
      clearTimeout(this.decayTimer);
      this.reverb = this.makeReverb(b);
      this.damp.disconnect(old);
      this.damp.connect(this.reverb);
      this.reverb.connect(this.master);
      setTimeout(() => old.dispose(), DISPOSE_AFTER_MS);
    } else if (this.reverb instanceof Tone.Freeverb) {
      if (!this.driven.has("bus.reverbSize")) this.reverb.roomSize.rampTo(b.reverbSize, RAMP);
    } else {
      // Setting decay regenerates the impulse response, so settle on the last value instead of every input event.
      clearTimeout(this.decayTimer);
      const decay = convolverDecay(b.reverbSize);
      this.decayTimer = setTimeout(() => {
        if (this.reverb instanceof Tone.Reverb) this.reverb.decay = decay;
      }, DECAY_DEBOUNCE_MS);
    }
  }

  setDriven(target: DriftTarget, on: boolean): void {
    if (on) this.driven.add(target);
    else this.driven.delete(target);
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
    clearTimeout(this.decayTimer);
    for (const id of [...this.channels.keys()]) this.removeLayer(id, true);
    this.delay.dispose();
    this.damp.dispose();
    this.reverb.dispose();
    this.master.dispose();
    this.masterVolume.dispose();
    this.limiter.dispose();
    this.clipScale.dispose();
    this.clip.dispose();
  }

  private makeReverb(b: BusSettings): Reverb {
    if (b.reverbKind === "freeverb") {
      return new Tone.Freeverb({ roomSize: b.reverbSize, dampening: FREEVERB_DAMPENING_HZ, wet: REVERB_WET });
    }
    return new Tone.Reverb({ decay: convolverDecay(b.reverbSize), preDelay: 0.05, wet: REVERB_WET });
  }
}

const convolverDecay = (size: number) => 1 + clamp(size, 0, 1) * 14;
