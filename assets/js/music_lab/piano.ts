/** CC0 upright piano (VSCO 2 CE). `null` means the samples are not installed. Tone note name -> file. */
export const PIANO_SAMPLES: Record<string, string> | null = {
  A1: "A1.mp3",
  F2: "F2.mp3",
  "C#3": "Cs3.mp3",
  E3: "E3.mp3",
  A3: "A3.mp3",
  "C#4": "Cs4.mp3",
  F4: "F4.mp3",
  A4: "A4.mp3",
  "C#5": "Cs5.mp3",
  A5: "A5.mp3",
  F6: "F6.mp3",
  "C#7": "Cs7.mp3",
};

export const PIANO_BASE_URL = "/audio/music/piano/";

/** The instrument a layer should use as the default for the notes layer. */
export const DEFAULT_NOTES_INSTRUMENT = PIANO_SAMPLES ? "piano" : "keys";

export function usesPiano(layers: readonly { instrument: string }[]): boolean {
  return PIANO_SAMPLES !== null && layers.some((l) => l.instrument === "piano");
}
