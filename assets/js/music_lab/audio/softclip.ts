/** The level the soft clip approaches but never reaches, in full-scale units. */
export const SOFT_CLIP_CEILING = 0.98;
/** Below this level (about -6 dBFS) the soft clip passes the signal through unchanged. */
export const SOFT_CLIP_KNEE = 0.5;
/** The curve spans inputs in [-SOFT_CLIP_RANGE, SOFT_CLIP_RANGE] (+18 dBFS); the shaper is fed input / SOFT_CLIP_RANGE. */
export const SOFT_CLIP_RANGE = 8;

/** Identity below the knee, then a tanh bend whose slope matches at the knee and which tends to the ceiling. */
export function softClip(x: number): number {
  const a = Math.abs(x);
  if (a <= SOFT_CLIP_KNEE) return x;
  const room = SOFT_CLIP_CEILING - SOFT_CLIP_KNEE;
  return Math.sign(x) * (SOFT_CLIP_KNEE + room * Math.tanh((a - SOFT_CLIP_KNEE) / room));
}

/**
 * A WaveShaper curve for `softClip` over [-SOFT_CLIP_RANGE, SOFT_CLIP_RANGE]. A WaveShaper holds its end values for
 * input beyond the curve, so every output stays inside (-1, 1).
 */
export function softClipCurve(length: number): Float32Array {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) curve[i] = softClip(SOFT_CLIP_RANGE * ((2 * i) / (length - 1) - 1));
  return curve;
}

/** Up to this many layers play at full level; the default piece has three. */
export const HEADROOM_FREE_LAYERS = 3;

/**
 * Gain ahead of the limiter so extra layers don't pile into it: uncorrelated layers add in power, so the mix is
 * trimmed by sqrt(free / n) beyond the free count, keeping the summed level about where three layers sit.
 */
export function layerHeadroomGain(layerCount: number): number {
  return layerCount <= HEADROOM_FREE_LAYERS ? 1 : Math.sqrt(HEADROOM_FREE_LAYERS / layerCount);
}
