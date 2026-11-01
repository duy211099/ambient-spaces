# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Living Ambience: a calm ambient-sound web app. Phoenix 1.7 only serves pages and static assets. There is no database and no server-side state. Almost all logic is TypeScript in `assets/js/`. Two routes (`lib/living_ambience_web/router.ex`):

- `/` is the cafe-by-a-rainy-window scene. Phaser 4 owns the loop and input, entities draw with Canvas 2D, and the audio is raw Web Audio.
- `/music` is a throwaway generative-music spike built on Tone.js (`assets/js/music_lab/lab.ts`). A redesign into a "studio with a guide" is specced in `docs/superpowers/specs/2026-11-01-music-studio-design.md`. It draws on the course notes in `../knowledge/building-generative-music-systems/` (outside this repo).

`app.ts` boots both. Each boot function returns early when its page's DOM root is missing.

## Commands

```
mix setup                         # deps, npm install in assets/, esbuild/tailwind binaries, build
mix phx.server                    # http://localhost:4000 (tap once to start audio); ?hour=22 previews night tint
mix compile --warnings-as-errors
mix test                          # ExUnit; only controller tests exist
mix test test/living_ambience_web/controllers/page_controller_test.exs:LINE   # single test
mix typecheck                     # cd assets && npx tsc --noEmit
```

Bundling uses Phoenix's esbuild binary (pinned to 0.17.11 in `config/config.exs`), not an npm script. `tsc` only type-checks, so every TS file needs to pass under `strict`, `noUnusedLocals`, `noUnusedParameters` and `isolatedModules`. There is no JS test runner. To verify front-end behavior, drive the page in a browser. `app.ts` exposes `window.__ambience.{audio(), levels(), mix()}` for inspecting live audio gains, smoothed visual levels and the mix state.

## Architecture (the `/` scene)

Data flow: `Controls` (DOM sliders) → `MixStore.dispatch` (reducer in `state/mix.ts`) → on each change, `sync()` in `app.ts` pushes the same `MixState` to `AudioEngine.apply` and `Scene.setMix`, then saves to localStorage after a debounce.

The core invariant: **one value per layer drives both audio and visuals, on the same easing curve.** The engine eases gain with `setTargetAtTime(v, now, TAU)`. The scene feeds the same target into a `Smoother` that uses the same `TAU` (`core/smoother.ts`). Entities read only `Frame.level(id)`, the smoothed value, and never the raw target. Do not add code paths that let visuals or audio read the raw targets. If you do, the two will drift apart.

Other rules that span files:
- Every visual must be fully absent when its layer is at volume 0.
- Scenes are data. A `SceneConfig` (`scenes/<id>/config.ts`, registered in `scenes/registry.ts`, selected by `data-scene` in `page_html/home.html.heex`) lists layers and entity kinds. It holds no art.
- Art lives in `scene/entities/`. `EntityKind` (in `core/types.ts`) maps to a factory in `scene/entities/registry.ts`. A factory receives its bound `LayerId`, or `null` for idle-life entities. Adding a kind means touching `core/types.ts`, the entity file and the registry. `Scene` throws on load if a layer's entity is missing from `entities`.
- `scene/renderer.ts` wraps a Phaser game. It owns resize, DPR, parallax and hit-testing (clicking a layer's `hit` rect focuses its slider). Entities draw into one Phaser canvas texture so that future sprites can sit on top of it.
- Audio graph: layer gains → window low-pass (outdoor layers only) → master. Each layer plays an optional file from `priv/static/audio/<scene>/`. With `src: null`, or when the file fails to load (one `console.warn`), it plays a procedural fallback from `audio/procedural.ts`. Any audio file you add must be CC0 and recorded in `CREDITS.md`.
- `AudioContext` creation must happen behind a user gesture (`AudioEngine.start()`, via `ensureStarted()`).
- Honor `prefers-reduced-motion`: no parallax, half the particles (`Frame.particleScale`), and fades instead of walks.

`README.md` has the step-by-step for adding a scene. `PLAN.md` has the volume→visual mapping table for each layer.
