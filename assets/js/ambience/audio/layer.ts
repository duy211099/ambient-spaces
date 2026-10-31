import { TAU } from "../core/smoother";
import type { LayerConfig } from "../core/types";
import { synthesize } from "./procedural";

async function decodeFile(ctx: AudioContext, src: string): Promise<AudioBuffer> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

function proceduralBuffer(ctx: AudioContext, cfg: LayerConfig): AudioBuffer {
  const synth = synthesize(cfg.audio.fallback);
  const buf = ctx.createBuffer(synth.channels.length, synth.channels[0].length, synth.sampleRate);
  synth.channels.forEach((data, i) => buf.getChannelData(i).set(data));
  return buf;
}

/** Try the configured file once; on any failure warn once and use the procedural loop. */
export async function loadLayerBuffer(ctx: AudioContext, cfg: LayerConfig): Promise<AudioBuffer> {
  if (cfg.audio.src !== null) {
    try {
      return await decodeFile(ctx, cfg.audio.src);
    } catch (err) {
      console.warn(`[ambience] ${cfg.id}: could not load ${cfg.audio.src} (${String(err)}); using procedural fallback`);
    }
  }
  return proceduralBuffer(ctx, cfg);
}

export class Layer {
  readonly gain: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    buffer: AudioBuffer,
    destination: AudioNode,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.gain);
    source.start();
  }

  setVolume(v: number): void {
    this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, TAU);
  }
}
