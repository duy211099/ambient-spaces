const MIDI_LOW = 24;
const MIDI_HIGH = 108;
const MARGIN = 0.08;
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Ab4" -> 68, "C#5" -> 73. Returns null for names it cannot read. */
export function noteToMidi(note: string): number | null {
  const m = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(note);
  if (!m) return null;
  const base = SEMITONES[(m[1] as string).toUpperCase()];
  if (base === undefined) return null;
  let shift = 0;
  for (const ch of m[2] as string) shift += ch === "#" ? 1 : -1;
  return (Number(m[3]) + 1) * 12 + base + shift;
}

export interface RippleSpot {
  x: number;
  y: number;
  maxRadius: number;
}

export function rippleLayout(midi: number, layerIndex: number, layerCount: number, width: number, height: number): RippleSpot {
  const t = Math.min(1, Math.max(0, (midi - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW)));
  const x = width * (MARGIN + t * (1 - 2 * MARGIN));
  const count = Math.max(1, layerCount);
  const y = ((Math.min(Math.max(layerIndex, 0), count - 1) + 0.5) / count) * height;
  return { x, y, maxRadius: Math.min(width, height) * 0.18 };
}
