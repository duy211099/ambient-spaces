import * as Tone from "tone";
import { effectiveLayer } from "../mood.ts";
import { createRng } from "../rng.ts";
import { LayerScheduler } from "../scheduler.ts";
import type { StudioSettings } from "../settings.ts";
import { toneClock } from "./engine.ts";
import { StudioGraph } from "./graph.ts";
import { makeInstrument, noteLength } from "./instruments.ts";

/** Renders `seconds` of audio offline and returns the largest absolute sample over all channels. */
export async function renderPeak(s: StudioSettings, seconds: number): Promise<number> {
  const buffer = await Tone.Offline(async ({ transport }) => {
    const graph = new StudioGraph(s);
    const clock = toneClock(transport);
    const mood = () => s.mood;
    for (const layer of s.layers) {
      const rng = createRng(s.seed).fork(layer.id);
      const instrument = makeInstrument(layer.instrument);
      instrument.connect(graph.layerInput(layer.id));
      const scheduler = new LayerScheduler(
        clock,
        rng,
        (e) => instrument.triggerAttackRelease(e.note, noteLength(layer.instrument, rng), e.time, e.velocity),
        mood,
        (l) => effectiveLayer(l, s.mood).density,
      );
      scheduler.start(layer);
    }
    await Promise.all([graph.ready(), Tone.loaded()]);
    transport.start(0);
  }, seconds, 2);

  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    for (const v of buffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(v));
  }
  return peak;
}
