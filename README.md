# Living Ambience

A calm ambient-sound app. The first scene is "Cafe by a rainy window". It is
drawn in Canvas 2D from code inside a Phaser game, and sounds come from Web
Audio. Phaser is the only npm runtime dependency, and there is no third-party
audio.

Four layers (rain, crowd chatter, espresso machine, cafe music) each have a
slider and a visual that is fully absent at volume 0. A window toggle muffles
the outdoor layers with a low-pass filter. Click a scene element to focus its
slider. The mix is saved in localStorage.

## Run

```
mix setup
mix phx.server
```

Open http://localhost:4000 and tap to start (browsers require a user gesture
before audio can play). Add `?hour=22` to preview the night tint.

## Check

```
mix compile --warnings-as-errors
mix test
mix typecheck        # runs: cd assets && npx tsc --noEmit
```

## Layout

```
assets/js/app.ts                      boot and wiring
assets/js/ambience/core/              shared types, Smoother
assets/js/ambience/state/mix.ts       MixState reducer, validation, persistence
assets/js/ambience/audio/             engine, layer loader, procedural fallbacks
assets/js/ambience/scene/             renderer, scene, entities, entity registry
assets/js/ambience/ui/controls.ts     sliders, window toggle, play/pause, idle fade
assets/js/ambience/scenes/            one folder per scene, plus registry.ts
priv/static/audio/<scene>/            optional audio files
```

One value per layer drives both audio and visuals. The engine eases gain with
`setTargetAtTime(v, now, TAU)` and the scene feeds the same target into a
`Smoother` with the same `TAU`. Entities read only the smoothed level.

## Add a scene

1. Create `assets/js/ambience/scenes/<id>/config.ts` exporting a `SceneConfig`.
   Copy `cafe-rain/config.ts` as a starting point.
2. Declare each layer: `id` (via `layerId("...")`), `label`, `audio`
   (`src`, `fallback` kind, `outdoor`), `entity`, a `hit` rect in scene
   coordinates, and `defaultVolume`.
3. List `entities` in draw order. Every layer's `entity` must appear in it
   (the scene throws on load if not).
4. If you need a new look, add a factory in `scene/entities/` and register it
   under a new `EntityKind` in `scene/entities/registry.ts` and
   `core/types.ts`. A factory receives the bound `LayerId` or `null` and
   returns an `Entity` that reads its smoothed level and draws itself.
5. Register the config in `scenes/registry.ts`.
6. Point the page at it by setting `data-scene="<id>"` in
   `lib/living_ambience_web/controllers/page_html/home.html.heex`.
7. Optional audio: put a CC0 file at `priv/static/audio/<id>/<name>.ogg`, set
   `src` to `/audio/<id>/<name>.ogg`, and record it in `CREDITS.md`. With
   `src: null` (the default) the procedural fallback plays and nothing is
   fetched. If a file fails to load, one `console.warn` is logged and the
   fallback plays.
8. Run the checks above, then drive the page in a browser: every visual must
   be absent at volume 0 and the mix must survive a reload.
