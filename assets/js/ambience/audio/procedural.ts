import type { ProceduralKind } from "../core/types";

/**
 * Procedural fallback loops, synthesized into Float32Arrays. Every loop is
 * rendered a little longer than needed and its tail is crossfaded into its
 * head, so the loop point is continuous and click-free.
 */

export interface SynthBuffer {
  sampleRate: number;
  channels: Float32Array[];
}

const SR = 22050;

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Filter = (x: number) => number;

function biquad(type: "lp" | "hp" | "bp", freq: number, q: number): Filter {
  const w0 = (2 * Math.PI * freq) / SR;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  let b0: number, b1: number, b2: number;
  if (type === "lp") {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === "hp") {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Smoothly interpolated random walk in [-1, 1] changing about `hz` times a second. */
function smoothRandom(rng: Rng, hz: number): () => number {
  const step = SR / hz;
  let from = rng() * 2 - 1;
  let to = rng() * 2 - 1;
  let i = 0;
  return () => {
    if (i >= step) {
      i = 0;
      from = to;
      to = rng() * 2 - 1;
    }
    const p = i++ / step;
    const s = (1 - Math.cos(Math.PI * p)) / 2;
    return from + (to - from) * s;
  };
}

function loopable(raw: Float32Array, frames: number, fade: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = raw[i];
  for (let i = 0; i < fade; i++) {
    const p = i / fade;
    out[i] = raw[i] * Math.sin((p * Math.PI) / 2) + raw[frames + i] * Math.cos((p * Math.PI) / 2);
  }
  return out;
}

/** Scale to a target RMS, then soft-limit so nothing spikes. */
function level(chs: Float32Array[], rms: number): void {
  let sum = 0;
  let n = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++, n++) sum += c[i] * c[i];
  const k = rms / Math.sqrt(sum / n || 1);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] = Math.tanh(c[i] * k * 1.1) / 1.1;
}

type Gen = (frames: number, rng: Rng, channel: number) => Float32Array;

function rainGen(frames: number, rng: Rng): Float32Array {
  const out = new Float32Array(frames);
  const lp = biquad("lp", 5200, 0.7);
  const hp = biquad("hp", 380, 0.7);
  const swell = smoothRandom(rng, 0.25);
  for (let i = 0; i < frames; i++) out[i] = hp(lp(rng() * 2 - 1)) * (0.85 + 0.15 * swell());
  const ticks = Math.floor((frames / SR) * 20);
  for (let k = 0; k < ticks; k++) {
    const start = Math.floor(rng() * (frames - 800));
    const freq = 1800 + rng() * 2600;
    const amp = 0.25 + rng() * 0.5;
    for (let j = 0; j < 700; j++) {
      out[start + j] += Math.sin((2 * Math.PI * freq * j) / SR) * Math.exp(-j / 70) * amp * 0.5;
    }
  }
  return out;
}

function murmurGen(frames: number, rng: Rng): Float32Array {
  const out = new Float32Array(frames);
  const bed = biquad("bp", 500, 0.6);
  for (let i = 0; i < frames; i++) out[i] += bed(rng() * 2 - 1) * 0.25;
  for (let v = 0; v < 6; v++) {
    const band = biquad("bp", 350 + rng() * 1050, 2.4);
    const rate = 3.2 + rng() * 2.4;
    const phase = rng() * 6.28;
    const wobble = smoothRandom(rng, 0.7);
    const phrase = smoothRandom(rng, 0.35 + rng() * 0.2);
    for (let i = 0; i < frames; i++) {
      const t = i / SR;
      const syl = 0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t + phase + 1.4 * wobble());
      const gate = Math.min(1, Math.max(0, 0.5 + 1.4 * phrase()));
      out[i] += band(rng() * 2 - 1) * syl * syl * gate;
    }
  }
  return out;
}

function hissGen(frames: number, rng: Rng): Float32Array {
  const out = new Float32Array(frames);
  const humLp = biquad("lp", 220, 0.7);
  for (let i = 0; i < frames; i++) {
    const t = i / SR;
    out[i] =
      0.22 * Math.sin(2 * Math.PI * 60 * t) +
      0.11 * Math.sin(2 * Math.PI * 120 * t) +
      humLp(rng() * 2 - 1) * 0.5;
  }
  const secs = frames / SR;
  const hp = biquad("hp", 2400, 0.7);
  const lp = biquad("lp", 8000, 0.7);
  const gurgle = biquad("bp", 700, 1.5);
  const bursts = [secs * 0.2, secs * 0.5, secs * 0.78];
  for (let i = 0; i < frames; i++) {
    const t = i / SR;
    let env = 0;
    for (const b of bursts) {
      const d = t - b;
      if (d > 0 && d < 2.3) env = Math.max(env, Math.min(1, d / 0.18) * Math.exp(-d / 1.1));
    }
    if (env > 0.001) {
      const n = rng() * 2 - 1;
      out[i] += (lp(hp(n)) * 0.9 + gurgle(n) * 0.5 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 13 * t))) * env * 0.9;
    }
  }
  return out;
}

const PENTATONIC = [0, 2, 4, 7, 9];
const noteHz = (degree: number, octave: number): number => {
  const semis = PENTATONIC[degree % 5] + 12 * (octave + Math.floor(degree / 5));
  return 261.63 * Math.pow(2, semis / 12);
};

function padsGen(frames: number, rng: Rng): Float32Array {
  const out = new Float32Array(frames);
  const secs = frames / SR;
  const chords = [
    [0, 2, 4],
    [3, 1, 6],
    [2, 4, 5],
    [1, 3, 5],
  ];
  const span = secs / chords.length;
  chords.forEach((chord, ci) => {
    const t0 = ci * span - 1.0;
    chord.forEach((deg, ni) => {
      const f = noteHz(deg, ni === 0 ? -1 : 0);
      for (const detune of [0.9985, 1.0015]) {
        const attack = 2.2;
        const release = 3.2;
        const dur = span + 1.0;
        const start = Math.max(0, Math.floor(t0 * SR));
        const end = Math.min(frames, Math.floor((t0 + dur + release) * SR));
        for (let i = start; i < end; i++) {
          const t = i / SR - t0;
          const env = Math.min(1, t / attack) * (t < dur ? 1 : Math.exp(-(t - dur) / (release / 3)));
          const w = 2 * Math.PI * f * detune * t;
          out[i] += (Math.sin(w) + 0.28 * Math.sin(2 * w) + 0.1 * Math.sin(3 * w)) * env * 0.09;
        }
      }
    });
  });
  const notes = 11;
  for (let n = 0; n < notes; n++) {
    const t0 = (n / notes) * secs + rng() * 1.2;
    const f = noteHz(Math.floor(rng() * 6) + 5, 0);
    const start = Math.floor(t0 * SR);
    for (let i = start; i < Math.min(frames, start + 4 * SR); i++) {
      const t = (i - start) / SR;
      const env = Math.min(1, t / 0.01) * Math.exp(-t / 0.9);
      const w = 2 * Math.PI * f * t;
      out[i] += (Math.sin(w) + 0.2 * Math.sin(2 * w)) * env * 0.07;
    }
  }
  const delay = Math.floor(0.38 * SR);
  const tone = biquad("lp", 2600, 0.7);
  for (let i = delay; i < frames; i++) out[i] += out[i - delay] * 0.35;
  for (let i = 0; i < frames; i++) out[i] = tone(out[i]);
  return out;
}

interface Recipe {
  seconds: number;
  fade: number;
  channels: number;
  rms: number;
  gen: Gen;
}

const RECIPES: Record<ProceduralKind, Recipe> = {
  rain: { seconds: 20, fade: 2, channels: 2, rms: 0.1, gen: rainGen },
  murmur: { seconds: 24, fade: 2.5, channels: 2, rms: 0.08, gen: murmurGen },
  hiss: { seconds: 22, fade: 2, channels: 1, rms: 0.06, gen: hissGen },
  pads: { seconds: 28, fade: 3, channels: 2, rms: 0.07, gen: padsGen },
};

export function synthesize(kind: ProceduralKind): SynthBuffer {
  const r = RECIPES[kind];
  const frames = Math.floor(r.seconds * SR);
  const fade = Math.floor(r.fade * SR);
  const channels: Float32Array[] = [];
  for (let c = 0; c < r.channels; c++) {
    const rng = mulberry32(1000 * (c + 1) + kind.length * 17 + kind.charCodeAt(0));
    channels.push(loopable(r.gen(frames + fade, rng, c), frames, fade));
  }
  level(channels, r.rms);
  return { sampleRate: SR, channels };
}
