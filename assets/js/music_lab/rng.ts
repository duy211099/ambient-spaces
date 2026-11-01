export interface Rng {
  next(): number;
  between(min: number, max: number): number;
  weightedIndex(weights: readonly number[]): number;
  fork(label: string): Rng;
}

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (min, max) => min + next() * (max - min),
    weightedIndex(weights) {
      let total = 0;
      for (const w of weights) total += Math.max(0, w);
      if (total <= 0) return 0;
      let r = next() * total;
      let last = 0;
      for (let i = 0; i < weights.length; i++) {
        const w = Math.max(0, weights[i]);
        if (w === 0) continue;
        last = i;
        if (r < w) return i;
        r -= w;
      }
      return last;
    },
    fork: (label) => createRng(fnv1a(`${seed >>> 0}:${label}`)),
  };
}

export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * (2 ** 31 - 1));
}
