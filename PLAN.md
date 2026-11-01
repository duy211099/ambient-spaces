# Living Ambience: plan

## Architecture

Phoenix 1.7 serves one page and the static assets. There is no database and no
server-side state: the mix lives in the browser (localStorage). Phoenix's own
esbuild compiles TypeScript straight from `assets/js/**/*.ts`; `tsc --noEmit`
type-checks it. Phaser (the only npm runtime dep) owns the loop and input; the
scene entities still draw with Canvas 2D into a Phaser canvas texture, so future
sprites can sit on top of them.

```
lib/living_ambience_web/controllers/page_*    one page: <canvas>, controls root, scene id
priv/static/audio/<scene>/*.ogg               optional CC0 loops (procedural fallback if absent)
assets/js/app.ts                              boot: picks scene config, wires engine + scene + ui
assets/js/ambience/
  core/types.ts         SceneConfig, LayerConfig, MixState, Level (shared shapes)
  core/smoother.ts      eased value that mirrors AudioParam.setTargetAtTime
  audio/engine.ts       AudioContext, master gain, window low-pass, layer registry
  audio/layer.ts        one looping source -> GainNode
  audio/procedural.ts   seamless-loop noise/murmur/hiss/music buffers (fallbacks)
  scene/renderer.ts     Phaser game: loop, resize, parallax, hit testing
  scene/entities/*.ts   rain, customers, barista, speaker, window, cat, lamps
  ui/controls.ts        sliders, master, play/pause, window toggle, idle fade
  state/mix.ts          MixState reducer + persistence (try/catch)
  scenes/cafe-rain/config.ts   the scene: layers, assets, volume -> visual maps
```

## Core shapes

```ts
type LayerId = string & { readonly __brand: "LayerId" };

interface LayerConfig {
  id: LayerId;
  label: string;
  audio: { src: string | null; fallback: ProceduralKind; outdoor: boolean };
  entity: EntityKind;          // which scene entity renders this layer
  hit: Rect;                   // click target in scene coordinates -> focus slider
  defaultVolume: number;       // 0..1
}

interface SceneConfig {
  id: string;
  title: string;
  size: { w: number; h: number };     // logical scene coordinates
  layers: LayerConfig[];
  windowFilterHz: number;              // low-pass cutoff when the window is closed
  entities: EntityKind[];              // idle-life entities (cat, lamps, steam...)
}

interface MixState {
  version: 1;
  master: number;
  windowOpen: boolean;
  layers: Record<LayerId, number>;     // target volume 0..1
}
```

One value per layer drives both sides. A slider writes `MixState.layers[id]`.
The engine calls `gain.setTargetAtTime(v, now, TAU)` and the scene feeds the same
target into a `Smoother` with the same `TAU` (0.45 s, so about 1.5 s to settle).
Every entity reads only the smoothed `level`, never the raw target. Audio and
visuals therefore ease on the same curve and cannot drift apart.

## Volume -> visual mapping (cafe-rain)

| Layer | 0 | rising level | 1.0 |
|---|---|---|---|
| Rain | no drops, dry clear glass | drop count `~ level * 220`, drop length and speed grow, glass streaks `~ level * 14`, fog alpha `level * 0.35` | heavy but slow-moving rain, fogged glass |
| Crowd | every seat empty | target seated = `round(level * 8)`; each seat is a state machine `empty -> entering -> seated -> leaving -> empty`; customers walk in from the door and walk out | 8 customers sipping, chatting, on phones |
| Espresso | barista idle-absent, machine dark, no steam | barista visible with alpha `min(1, level*3)`, steam puff rate `~ level`, machine light glow `level` | frequent soft steam puffs, barista working |
| Music | radio dark | glow `level`, note particle rate `~ level * 1.2/s` | warm glow, a gentle stream of notes |

Seat state machine keeps entries and exits staggered (one transition per ~0.8 s)
so the room fills and empties gradually. With `prefers-reduced-motion`, particle
counts are halved, parallax is off and walks become fades.

Window: `open` removes the low-pass (cutoff ramps to 20 kHz), `closed` ramps it to
1000 Hz on outdoor layers only. The window pane slides with the same easing.

## Assets

| Layer | File (optional) | Fallback |
|---|---|---|
| Rain | `audio/cafe-rain/rain.ogg` | pink-ish noise, band-shaped, with droplet ticks |
| Crowd | `audio/cafe-rain/crowd.ogg` | band-passed noise with slow syllable-rate modulation |
| Espresso | `audio/cafe-rain/espresso.ogg` | soft hiss bursts plus low hum |
| Music | `audio/cafe-rain/music.ogg` | generative soft pentatonic pads |

Procedural buffers are made loop-seamless by crossfading the tail into the head
before looping. Missing files log one `console.warn` and use the fallback.
All art is drawn in code (original shapes, no logos).
