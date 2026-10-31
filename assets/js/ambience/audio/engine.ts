import { TAU } from "../core/smoother";
import type { LayerId, MixState, SceneConfig } from "../core/types";
import { Layer, loadLayerBuffer } from "./layer";

const OPEN_HZ = 20000;

export interface AudioSnapshot {
  state: AudioContextState | "idle";
  master: number;
  filterHz: number | null;
  layers: Record<string, number>;
}

/** Web Audio graph: layer gains -> (window low-pass, outdoor only) -> master -> output. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private starting: Promise<void> | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private layers = new Map<LayerId, Layer>();
  private mix: MixState;
  private playing = true;
  private suspendTimer: number | undefined;

  constructor(
    private readonly cfg: SceneConfig,
    initial: MixState,
  ) {
    this.mix = initial;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  start(): Promise<void> {
    this.starting ??= this.build();
    return this.starting;
  }

  apply(mix: MixState, playing: boolean): void {
    this.mix = mix;
    this.playing = playing;
    this.push();
  }

  snapshot(): AudioSnapshot {
    const layers: Record<string, number> = {};
    for (const [id, layer] of this.layers) layers[id] = layer.gain.gain.value;
    return {
      state: this.ctx?.state ?? "idle",
      master: this.master?.gain.value ?? 0,
      filterHz: this.filter?.frequency.value ?? null,
      layers,
    };
  }

  private async build(): Promise<void> {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.value = this.filterTarget();
    filter.connect(master);
    this.master = master;
    this.filter = filter;

    await ctx.resume();
    const buffers = await Promise.all(this.cfg.layers.map((l) => loadLayerBuffer(ctx, l)));
    this.cfg.layers.forEach((l, i) => {
      this.layers.set(l.id, new Layer(ctx, buffers[i], l.audio.outdoor ? filter : master));
    });
    this.push();
  }

  private filterTarget(): number {
    const nyquist = this.ctx ? this.ctx.sampleRate / 2 : OPEN_HZ;
    return this.mix.windowOpen ? Math.min(OPEN_HZ, nyquist) : this.cfg.windowFilterHz;
  }

  private push(): void {
    const { ctx, master, filter } = this;
    if (!ctx || !master || !filter) return;
    window.clearTimeout(this.suspendTimer);
    if (this.playing) {
      if (ctx.state === "suspended") void ctx.resume();
    } else {
      this.suspendTimer = window.setTimeout(() => {
        if (!this.playing) void ctx.suspend();
      }, TAU * 6000);
    }
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(this.playing ? this.mix.master : 0, now, TAU);
    filter.frequency.setTargetAtTime(this.filterTarget(), now, TAU);
    for (const [id, layer] of this.layers) layer.setVolume(this.mix.layers[id]);
  }
}
