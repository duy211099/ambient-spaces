import * as Tone from "tone";
import { PIANO_BASE_URL, PIANO_SAMPLES } from "../piano.ts";
import type { Rng } from "../rng.ts";
import type { InstrumentId } from "../settings.ts";

export type Instrument = Tone.PolySynth | Tone.Sampler;

const MAX_POLYPHONY = 24;
const INSTRUMENT_DB = -8;

function keys(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 2.5, sustain: 0, release: 3 },
  });
}

function pad(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsine", count: 3, spread: 20 },
    envelope: { attack: 2.5, decay: 1, sustain: 0.6, release: 6 },
  });
}

function bell(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 12,
    envelope: { attack: 0.002, decay: 4, sustain: 0, release: 5 },
    modulationEnvelope: { attack: 0.002, decay: 1.5, sustain: 0, release: 2 },
  });
}

// Lesson 3: a plain sine, the simplest voice.
function tone(): Tone.PolySynth {
  return new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 2 },
  });
}

// Lesson 4: recorded notes instead of a synthesized voice. Samples are pitched to fill the gaps.
function piano(): Tone.Sampler | null {
  if (!PIANO_SAMPLES) return null;
  return new Tone.Sampler({ urls: PIANO_SAMPLES, baseUrl: PIANO_BASE_URL, release: 1 });
}

export function makeInstrument(id: InstrumentId): Instrument {
  let inst: Instrument;
  switch (id) {
    case "pad":
      inst = pad();
      break;
    case "bell":
      inst = bell();
      break;
    case "tone":
      inst = tone();
      break;
    case "piano":
      inst = piano() ?? keys();
      break;
    case "keys":
      inst = keys();
      break;
  }
  if (inst instanceof Tone.PolySynth) inst.maxPolyphony = MAX_POLYPHONY;
  inst.volume.value = INSTRUMENT_DB;
  return inst;
}

/** Note length in seconds. Pad holds longer, with a length drawn from the layer's rng. */
export function noteLength(id: InstrumentId, rng: Rng): number {
  if (id === "pad") return rng.between(4, 8);
  if (id === "tone") return 3;
  return 4;
}
