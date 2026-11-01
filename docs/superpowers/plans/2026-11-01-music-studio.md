# Music Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/music` spike with a generative music studio (layers, per-note timers, effects bus, drift, mood, seeds, share links, recording, ripple visual) plus an in-page guide and tour that cover the whole course.

**Architecture:** Pure TypeScript modules (seeded RNG, settings model, timing math, mood, layer scheduling against an abstract clock, share/store, guide data) are unit-tested with Node's built-in test runner. A thin Tone.js layer (instruments, audio graph, drift LFOs, engine) binds them to sound. The UI is generated from a control-definition table so every control carries a guide id.

**Tech Stack:** Phoenix 1.7 (one route, one HEEx template), TypeScript bundled by esbuild 0.17, Tone.js 15, Canvas 2D, `node --test` (Node 22.19 type stripping), Playwright MCP for in-browser checks.

**Spec:** `docs/superpowers/specs/2026-11-01-music-studio-design.md`. Read it before any task.

## Global Constraints

- All work is in `living_ambience/`. Route `GET /music`, template `lib/living_ambience_web/controllers/page_html/music.html.heex`, booted from `assets/js/app.ts`.
- No new runtime npm dependencies. Tone.js (`tone ^15.1.22`) is the audio library. No dev dependencies either: tests use `node --test`.
- Pure modules (anything with a `*.test.ts`) must not import `tone` or touch `window`/`document`, and must be valid under Node type stripping: no `enum`, no `namespace`, no constructor parameter properties. Relative imports use the `.ts` extension.
- Audio files: CC0 only, under `priv/static/audio/`, recorded in `CREDITS.md` in the same commit.
- Audio starts only after a user gesture.
- Safety caps (exact): delay feedback ≤ 0.8; filter Q ≤ 1; layer volume clamped to [-40, -6] dB; master volume clamped to [-40, -3] dB; master limiter threshold -1 dB.
- The cafe scene at `/` must keep working: `mix test` and a load of `/` with no console errors after every task.
- Checks after every task: `mix compile --warnings-as-errors`, `mix test`, `mix typecheck`, `cd assets && npm test`.
- Guide text: plain, 2–4 sentences, no jargon, each entry names its source ("Lesson 6" or "Beyond the course").

## Review Focus

1. **Rapid control changes while playing** (spamming note-set, instrument, timing mode, reshuffle): pending timers must not stack. Expect the same note rate as before. Pinned in Task 3 (`reconfigure 50 times keeps one timer per note`).
2. **Corrupt or old share link / localStorage** (`#s=garbage`, `#s=v0...`, truncated JSON, a layer with 0 notes): the page loads defaults and still plays. Pinned in Task 1 (`normalizeSettings`) and Task 8 (`decodeShare`).
3. **Left playing for an hour** (including with the tab in the background): pending events stay bounded and no timer chain dies. Pinned in Task 3 (`simulated hour keeps pending events bounded`).
4. **Play pressed before piano samples finish loading:** the status shows "loading piano…", notes start after load, no exception. Pinned in Task 6 (browser step).
5. **Extreme settings** (all layers at max volume, max density, max brightness, max feedback, all drifts at full depth): no clipping. Pinned in Task 4 (`renderPeak` < 1.0) and re-run in Task 7 with drifts on.

---

## File Structure

```
assets/js/music_lab/
  rng.ts            seeded RNG (mulberry32), fork by label                 [pure]
  settings.ts       StudioSettings types, defaults, CAPS, normalize, extreme [pure]
  notesets.ts       NOTE_SETS data (incl. Eno 2/1), ENO_INTERVALS/OFFSETS  [pure]
  timing.ts         gap ranges, Eno loop lengths, random-once intervals    [pure]
  mood.ts           effectiveLayer(layer, mood)                            [pure]
  scheduler.ts      Clock interface + LayerScheduler (per-note timers, chord changes) [pure]
  share.ts          encodeShare / decodeShare                              [pure]
  store.ts          SettingsStore (subscribe, persist, preview/restore)    [pure]
  guide/entries.ts  GUIDE_ENTRIES                                          [pure]
  guide/tour.ts     TOUR_STEPS                                             [pure]
  ui/control-defs.ts CONTROL_DEFS (every control → setting path + guide id) [pure]
  visual/layout.ts  rippleLayout()                                         [pure]
  *.test.ts         tests next to each pure module
  audio/instruments.ts  makeInstrument(), PIANO_SAMPLES
  audio/graph.ts        StudioGraph: per-layer channel → shared delay→reverb bus → limiter
  audio/drift.ts        DriftRig: Tone.LFOs on audio params, drift-on-drift
  audio/engine.ts       StudioEngine: binds scheduler + graph + drift to Tone.Transport
  audio/offline.ts      renderPeak(settings, seconds)
  audio/recorder.ts     StudioRecorder
  visual/ripples.ts     Ripples canvas renderer
  ui/controls.ts        renders CONTROL_DEFS, layer panels, transport
  ui/guide-panel.ts     ⓘ panel
  ui/tour.ts            tour runner UI
  studio.ts             bootMusicStudio()
  lab.ts                DELETED in Task 5
```

`assets/tsconfig.json`: add `"allowImportingTsExtensions": true` and `"exclude": ["js/**/*.test.ts"]`.
`assets/package.json`: add `"test": "node --test \"js/music_lab/**/*.test.ts\""`.

---

### Task 1: Test runner, seeded RNG, settings model

**Files:**
- Modify: `assets/tsconfig.json`, `assets/package.json`, `mix.exs` (alias `"test.js": ["cmd --cd assets npm test"]`)
- Create: `assets/js/music_lab/rng.ts`, `settings.ts`, `notesets.ts`, `rng.test.ts`, `settings.test.ts`

**Interfaces:**
- Produces:
  - `interface Rng { next(): number; between(min: number, max: number): number; weightedIndex(weights: readonly number[]): number; fork(label: string): Rng }`
  - `createRng(seed: number): Rng`, `randomSeed(): number` (uses `Math.random`, returns integer in [1, 2^31-1])
  - `NOTE_SETS: Record<string, { label: string; notes: string[] }>` with ids `airports` (F4 Ab4 C5 Db5 Eb5 F5 Ab5), `pentatonic`, `night`, `nguCung` (copy the spike's notes), `drone` (F2 C3), `droneNight` (A2 E3), `bellsHigh` (C6 Eb6 F6 Ab6), `airportsAlt` (Db4 F4 Ab4 C5 Eb5 F5)
  - `ENO_INTERVALS = [23.53, 25.76, 29.123, 19.29, 16.831, 22.432, 27.97]`, `ENO_OFFSETS = [0, 5.23, 20.91, 15.47, 9.77, 19.55, 20.112]` (Lesson 6, exact)
  - Types in `settings.ts`:
    ```ts
    type InstrumentId = "piano" | "keys" | "pad" | "bell" | "tone";
    type TimingMode = "eno" | "randomOnce" | "randomEvery";
    type ReverbKind = "freeverb" | "convolver";
    interface LayerSettings {
      id: string; label: string; instrument: InstrumentId; mode: TimingMode;
      noteSetIds: string[];            // [0] is the starting set; length ≥ 2 enables chord changes
      changeEverySec: [number, number];
      weights: Record<string, number>; // note → 0.25..4, missing = 1
      density: number; brightness: number; volumeDb: number; send: number; muted: boolean;
    }
    interface BusSettings { reverbKind: ReverbKind; reverbSize: number; dampeningHz: number; delayTime: number; delayFeedback: number; delayWet: number }
    type DriftTarget = "bus.reverbWet" | "bus.reverbSize" | "bus.dampening" | "bus.delayFeedback" | `layer.${string}.brightness` | `layer.${string}.volume` | `layer.${string}.density`;
    interface DriftSettings { id: string; target: DriftTarget; periodSec: number; depth: number; enabled: boolean; modulatedBy: string | null } // modulatedBy = another drift id (drift-on-drift)
    interface StudioSettings { version: 1; seed: number; mood: number; masterDb: number; bus: BusSettings; layers: LayerSettings[]; drifts: DriftSettings[] }
    ```
  - `CAPS` (Global Constraints values), `DEFAULT_SETTINGS: StudioSettings`, `normalizeSettings(raw: unknown): StudioSettings`, `extremeSettings(): StudioSettings`

- [ ] **Step 1: Wire the runner.** Apply the tsconfig/package.json/mix.exs edits above. Run `cd assets && npm test`. Expected: exits 0 or "no test files" message, not a syntax error.

- [ ] **Step 2: Write failing tests**

```ts
// rng.test.ts
test("same seed gives same sequence", () => { const a = createRng(42), b = createRng(42); for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next()); });
test("next() is in [0,1)", ...1000 draws);
test("fork is deterministic and independent", () => {
  assert.equal(createRng(7).fork("bells").next(), createRng(7).fork("bells").next());
  assert.notEqual(createRng(7).fork("bells").next(), createRng(7).fork("drone").next());
});
test("weightedIndex follows weights", () => { /* weights [1,3], 10_000 draws → index 1 share within 0.72..0.78 */ });
test("weightedIndex never picks weight 0", ...);

// settings.test.ts
test("DEFAULT_SETTINGS is already normalized", () => assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS));
test("caps are enforced", () => {
  const s = normalizeSettings({ ...DEFAULT_SETTINGS, masterDb: 12, bus: { ...DEFAULT_SETTINGS.bus, delayFeedback: 2 }, layers: [{ ...DEFAULT_SETTINGS.layers[0], volumeDb: 0 }] });
  assert.equal(s.masterDb, -3); assert.equal(s.bus.delayFeedback, 0.8); assert.equal(s.layers[0].volumeDb, -6);
});
test("garbage returns defaults", () => { for (const raw of [null, 42, "x", {}, { version: 0 }]) assert.deepEqual(normalizeSettings(raw), DEFAULT_SETTINGS); });
test("unknown note-set ids are dropped; a layer left with none falls back to its default set", ...);
test("weights clamp to 0.25..4", ...);
test("drift pointing at a missing layer is dropped; modulatedBy pointing at a missing drift becomes null", ...);
test("extremeSettings is at the caps", () => { const s = extremeSettings(); assert.equal(s.bus.delayFeedback, 0.8); assert.ok(s.layers.every(l => l.volumeDb === -6 && l.density === 1 && !l.muted)); });
```

- [ ] **Step 3: Run** `cd assets && npm test`. Expected: FAIL (modules missing).

- [ ] **Step 4: Implement.**
  - `rng.ts` uses mulberry32.
  - `fork` hashes `seed` + `label` with FNV-1a into a new seed.
  - `DEFAULT_SETTINGS` has three layers, with ids `drone`, `notes` and `bells`:
    - `drone`: pad, randomEvery, `[drone, droneNight]`, density 0.15, volume -20, send 0.6
    - `notes`: keys, randomEvery, `[airports, airportsAlt]`, density 0.35, volume -14, send 0.5
    - `bells`: bell, randomEvery, `[bellsHigh]`, density 0.1, volume -22, send 0.7
  - It has one drift, `{ id: "reverb", target: "bus.reverbWet", periodSec: 1000, depth: 0.8, enabled: true, modulatedBy: null }`. 1000 s matches Lesson 8's 0.001 Hz.
  - Its other values are `mood: 0.5`, `masterDb: -10` and `seed: 1`, with `changeEverySec: [180, 420]`.
  - `normalizeSettings` never throws.

- [ ] **Step 5: Run** `npm test`, `mix typecheck`. Expected: PASS.

- [ ] **Step 6: Commit** `feat(music): seeded rng and studio settings model`

### Task 2: Timing math and mood

**Files:** Create `assets/js/music_lab/timing.ts`, `mood.ts`, `timing.test.ts`, `mood.test.ts`

**Interfaces:**
- Consumes: `LayerSettings`, `ENO_INTERVALS`, `ENO_OFFSETS`, `Rng`
- Produces:
  - `gapRange(density: number, weight: number): [number, number]`. At weight 1: min = 20 − 18.5·density, max = 40 − 36·density (the spike's numbers). Both are divided by `weight`.
  - `enoScale(density: number): number`, equal to `2 ** ((0.5 - density) * 2)`
  - `enoLoops(noteCount: number, density: number, rng: Rng): { interval: number; offset: number }[]`. The first 7 use `ENO_INTERVALS`/`ENO_OFFSETS`. Beyond 7, draw interval = `rng.between(16, 30) + rng.next()` and offset = `rng.between(0, 20)`. Every interval is multiplied by `enoScale(density)`.
  - `randomOnceIntervals(noteCount: number, density: number, weights: number[], rng: Rng): number[]`
  - `interface EffectiveLayer { density: number; brightness: number; send: number; velocity: [number, number] }`
  - `effectiveLayer(layer: LayerSettings, mood: number): EffectiveLayer`. Here d = mood − 0.5. density = clamp01(layer.density + 0.4·d), brightness = clamp01(layer.brightness + 0.3·d), send = clamp01(layer.send − 0.3·d), velocity = [0.3 + 0.2·d, 0.7 + 0.25·d], each end clamped to [0.1, 1].

- [ ] **Step 1: Failing tests**

```ts
test("gapRange matches the spike at weight 1", () => { assert.deepEqual(gapRange(0, 1), [20, 40]); assert.deepEqual(gapRange(1, 1), [1.5, 4]); });
test("heavier weight → shorter gaps", () => { const [a] = gapRange(0.5, 1), [b] = gapRange(0.5, 2); assert.ok(b < a); });
test("enoLoops uses Lesson 6 intervals at density 0.5", () => assert.deepEqual(enoLoops(7, 0.5, createRng(1)).map(l => l.interval), ENO_INTERVALS));
test("enoLoops keeps ratios when density changes", () => { const a = enoLoops(7, 0.2, createRng(1)), b = enoLoops(7, 0.9, createRng(1)); const r = a[0].interval / b[0].interval; a.forEach((l, i) => assert.ok(Math.abs(l.interval / b[i].interval - r) < 1e-9)); });
test("enoLoops beyond 7 notes is seeded", ...);
test("mood 0.5 leaves the layer unchanged", ...);
test("mood 1 is busier, brighter, drier, louder than mood 0", ...);
test("effectiveLayer stays in [0,1] at extremes", ...);
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(music): timing modes and mood math`

### Task 3: LayerScheduler against an abstract clock

The heart of the course: one timer per note, a fresh random gap after every note, and chord changes. It is built on an interface so it can be tested without Tone.

**Files:** Create `assets/js/music_lab/scheduler.ts`, `scheduler.test.ts`

**Interfaces:**
- Consumes: `timing.ts`, `mood.ts`, `Rng`, `NOTE_SETS`, `LayerSettings`
- Produces:
  ```ts
  interface Clock { now(): number; scheduleOnce(cb: (time: number) => void, at: number): number; clear(id: number): void }
  interface NoteEvent { layerId: string; note: string; time: number; velocity: number }
  class LayerScheduler {
    constructor(clock: Clock, rng: Rng, onNote: (e: NoteEvent) => void, getMood: () => number, getDensity: (layer: LayerSettings, time: number) => number);
    start(layer: LayerSettings): void;        // schedules every note of noteSetIds[activeSet]
    reconfigure(layer: LayerSettings): void;  // timing-affecting change → clear own timers, reschedule
    update(layer: LayerSettings): void;       // non-timing change (weights, density, mute) → read on next tick, no reschedule
    stop(): void;                             // clears every timer it owns
    pendingCount(): number;
    activeNoteSet(): string;
  }
  ```
- Rules:
  - **randomEvery:** each note reschedules itself at `time + rng.between(...gapRange(density, weight))`. The first start is `now + rng.between(0, max)`, except the first two notes, which start in `rng.between(0.1, 3)` so sound comes quickly.
  - **randomOnce:** fixed intervals from `randomOnceIntervals`, implemented as self-rescheduling `scheduleOnce`. Do not use `scheduleRepeat`, so `clear` works uniformly.
  - **eno:** use `enoLoops` intervals and offsets.
  - **Muted layers:** timers keep running and `onNote` is not called, so unmuting doesn't restart the pattern.
  - **Chord changes** apply when `noteSetIds.length ≥ 2`. A change timer fires at `rng.between(...changeEverySec)` and advances to the next set (wrapping). Only the note timers are cleared and rescheduled, with staggered starts `rng.between(0, 8)`. Notes already sounding ring out, because the scheduler never stops voices.
  - **Velocity:** `rng.between(...effectiveLayer(layer, getMood()).velocity)`.
  - **Density:** read through `getDensity(layer, time)` on every tick, so drift (Task 7) can move it without rescheduling.
  - **Stale callbacks:** a `generation` counter guards each callback, and a callback from an old generation does nothing.

- [ ] **Step 1: Failing tests.** Use a `FakeClock` in the test file: a sorted queue, `advance(seconds)` fires due callbacks in order, and `pending()` counts them.

```ts
test("one pending timer per note after start", () => { s.start(notesLayer); assert.equal(clock.pending(), 7); });
test("randomEvery plays every note within 3× max gap", ...advance(120), each note seen);
test("same seed → same first 50 note events", ...two schedulers, compare [note, time.toFixed(6)]);
test("eno mode at density 0.5 plays F4 at 0, 23.53, 47.06", ...);
test("weight 4 note plays ≥ 2.5× as often as weight 1 over 1 simulated hour", ...);
test("muted layer emits nothing but keeps its timers", ...);
test("reconfigure 50 times keeps one timer per note", () => { for (let i = 0; i < 50; i++) s.reconfigure({ ...layer, mode: i % 2 ? "eno" : "randomEvery" }); assert.equal(clock.pending(), 7); });            // Review Focus 1
test("simulated hour keeps pending events bounded", () => { s.start(chordLayer); clock.advance(3600); assert.ok(clock.pending() <= notesInLargestSet + 1); });  // Review Focus 3
test("chord change switches set and reschedules only notes", ...activeNoteSet() changes after changeEverySec[1]);
test("stop clears everything", () => { s.stop(); assert.equal(clock.pending(), 0); });
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `LayerScheduler` per the rules.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(music): per-note layer scheduler with chord changes`

### Task 4: Audio graph, instruments, engine, offline peak check

**Files:** Create `assets/js/music_lab/audio/instruments.ts`, `graph.ts`, `engine.ts`, `offline.ts`

**Interfaces:**
- Consumes: `LayerScheduler`, `Clock`, `NoteEvent`, `StudioSettings`, `effectiveLayer`, `CAPS`
- Produces:
  - `makeInstrument(id: InstrumentId): Tone.PolySynth | Tone.Sampler`. For `keys`, `pad` and `bell`, copy the spike's three definitions. `tone` is a plain sine `Tone.Synth` wrapped in a PolySynth (Lesson 3). `piano` falls back to `keys` until Task 6. Every instrument gets `maxPolyphony` 24.
  - `class StudioGraph { constructor(s: StudioSettings); layerInput(id: string): Tone.ToneAudioNode; applyBus(b: BusSettings): void; applyLayer(l: LayerSettings, eff: EffectiveLayer): void; addLayer(l: LayerSettings): void; removeLayer(id: string): void; readonly master: Tone.Gain; param(target: DriftTarget): Tone.Param<any> | null; dispose(): void }`
    - Topology per layer: instrument → `Filter`(lowpass, Q ≤ 1, cutoff `300·2^(6·brightness)`) → `Volume` → dry to master, plus a `Gain(send)` into the bus.
    - Bus: `FeedbackDelay` → reverb (`Freeverb` or `Reverb` by `reverbKind`) → master.
    - Master: `Volume(masterDb)` → `Limiter(-1)` → destination.
    - All parameter changes use `rampTo(v, 0.3)`.
  - `class StudioEngine { constructor(onNote: (e: NoteEvent & { layerIndex: number }) => void); start(s: StudioSettings): Promise<void>; apply(next: StudioSettings): void; stop(): void; readonly output: Tone.ToneAudioNode; get playing(): boolean }`
    - `apply` diffs against the last settings.
      - These changes call `scheduler.reconfigure`: `mode`, `noteSetIds`, `changeEverySec`, or a change of `seed`. A new seed recreates every layer's rng via `createRng(seed).fork(layer.id)`.
      - An `instrument` change swaps the instrument: release the old one and dispose it after 8 s, as the spike does.
      - Anything else goes to `scheduler.update` and `graph.applyLayer`/`applyBus`.
      - Layer add/remove maps to `addLayer`/`removeLayer` plus a new or stopped scheduler.
    - The Tone `Clock` adapter: `scheduleOnce` maps to `Tone.getTransport().scheduleOnce`, `clear` to `transport.clear`, and `now` to `transport.seconds`.
    - Notes are played with `triggerAttackRelease(note, length, time, velocity)`. Length is `rng.between(4, 8)` for pad, 3 for `tone`, and 4 otherwise.
    - The visual callback goes through `Tone.getDraw().schedule`.
  - `renderPeak(s: StudioSettings, seconds: number): Promise<number>` (in `offline.ts`) builds a `StudioGraph` and schedulers inside `Tone.Offline`, awaits `Tone.loaded()`, and returns the max abs sample over all channels.

- [ ] **Step 1: Implement** the three files per Interfaces. These are Tone bindings, so the logic under them is already tested.
- [ ] **Step 2: Typecheck.** Run `mix typecheck`. Expected: no errors.
- [ ] **Step 3: Expose the check hook.** Temporarily wire `renderPeak` and `extremeSettings` onto `window.__musicStudio` from `lab.ts`'s boot. Task 5 replaces that boot and keeps the hook.
- [ ] **Step 4: Verify in the browser (Review Focus 5).** Run `mix phx.server`. With Playwright MCP, open `http://localhost:4000/music`, click Play (to unlock audio), then evaluate `await window.__musicStudio.renderPeak(window.__musicStudio.extremeSettings(), 30)`. Expected: a number < 1.0. Record the value in the commit message.
- [ ] **Step 5: Commit** `feat(music): audio graph, engine, offline peak check (peak=<value>)`

### Task 5: Studio page, controls from definitions, delete the spike

**Files:**
- Create: `assets/js/music_lab/ui/control-defs.ts`, `ui/control-defs.test.ts`, `ui/controls.ts`, `studio.ts`
- Modify: `music.html.heex` (rewrite), `assets/js/app.ts:9,109` (import and call `bootMusicStudio`), `page_controller.ex` (title "Music studio", drop the spike comment), `test/living_ambience_web/controllers/page_controller_test.exs`
- Delete: `assets/js/music_lab/lab.ts`

**Interfaces:**
- Produces:
  - `interface ControlDef { id: string; label: string; kind: "range" | "select" | "toggle"; scope: "global" | "bus" | "layer"; path: string; min?: number; max?: number; step?: number; options?: Record<string, string>; guide: string }`
    - `path` is a dot path into `StudioSettings`, or into `LayerSettings` for scope `layer`.
    - `guide` is a guide entry id. Task 10 creates the entries, and the ids are fixed here.
  - `CONTROL_DEFS: ControlDef[]`, covering:
    - **global:** mood, masterDb, seed
    - **bus:** reverbKind, reverbSize, dampeningHz, delayTime, delayFeedback, delayWet
    - **layer:** instrument, mode, noteSet (first of noteSetIds), chordChanges (toggle: noteSetIds length), density, brightness, volumeDb, send, muted, per-note weights (generated per note, guide `weights`)
  - Guide ids used: `mood, master, seed, reverb-kind, reverb, dampening, delay, feedback, instrument, timing-eno, timing-random-once, timing-random-every, note-set, chord-changes, density, brightness, volume, send, mute, weights, layers, drift, drift-on-drift, scheduling-time, sampler, oscillator`
  - `getPath(obj, path)`, `setPath(obj, path, value)`: immutable, pure, in `control-defs.ts`
  - `renderControls(root: HTMLElement, s: StudioSettings, onChange: (next: StudioSettings) => void): { sync(s: StudioSettings): void }`
    - Each control gets an ⓘ button with `data-guide="<id>"` and a `data-control="<id>"` attribute (the tour highlights by it).
    - Layer panels have add (a copy of `notes` with a new id) and remove buttons.
  - `bootMusicStudio(): void` (in `studio.ts`) holds settings in a plain variable for now (Task 8 adds the store) and calls `engine.apply` on change.
  - Template:
    - `#music-studio` holds the transport (Play, Stop, Reshuffle, status), `<canvas id="studio-visual">`, `[data-controls]`, `<aside id="guide-panel" hidden>` and `<details data-log>`.
    - Styles stay inline, as in the spike. The palette is the spike's.
    - Narrow screens (< 720px) use one column, and the guide aside becomes a bottom sheet.

- [ ] **Step 1: Failing tests**

```ts
test("every control has a unique id and a guide id from the fixed list", ...);
test("every path resolves on DEFAULT_SETTINGS (layer paths on layers[0])", ...);
test("setPath is immutable", ...);
```
```elixir
test "GET /music renders the studio shell", %{conn: conn} do
  html = conn |> get(~p"/music") |> html_response(200)
  assert html =~ ~s(id="music-studio")
  assert html =~ ~s(id="studio-visual")
  assert html =~ ~s(id="guide-panel")
  assert html =~ "/assets/app.js"
end
```

- [ ] **Step 2: Run** `npm test` and `mix test`. Expected: FAIL.
- [ ] **Step 3: Implement** the defs, `controls.ts`, `studio.ts`, the template and the wiring. Delete `lab.ts`, and keep `window.__musicStudio = { settings: () => current, renderPeak, extremeSettings }`.
- [ ] **Step 4: Run** all four checks. Expected: PASS.
- [ ] **Step 5: Verify in the browser.**
  - Open `/music`, click Play, and expect the first note within 3 s.
  - Change the note set, instrument and mode 10 times quickly. Expect the note rate to stay steady and `window.__musicStudio` to report sane settings.
  - Add and remove a layer.
  - Open `/` and expect no console errors.
- [ ] **Step 6: Commit** `feat(music): studio page with layered controls; remove spike`

### Task 6: Piano samples (Lesson 4)

**Files:**
- Create: `priv/static/audio/music/piano/*`
- Modify: `audio/instruments.ts`, `CREDITS.md`, `studio.ts` (loading status)

**Interfaces:**
- Produces: `PIANO_SAMPLES: Record<string, string> | null` (note → filename; `null` = not installed), `PIANO_BASE_URL = "/audio/music/piano/"`

- [ ] **Step 1: Confirm the license.**
  - Open https://github.com/sgossner/VSCO-2-CE and read its LICENSE.
  - If it is not CC0, set `PIANO_SAMPLES = null` and skip to Step 4. The UI then labels the piano option "Piano (samples not installed)" and plays `keys`.
- [ ] **Step 2: Fetch the samples.**
  - Download the upright piano samples into a fresh empty directory in the scratchpad.
  - Pick about 12 notes spaced a minor third apart (A1 … C7), using one velocity layer (the softer one).
  - Convert them to mp3 at 128 kbps or lower with `ffmpeg` if it is available. Otherwise keep the wav files only if their total is ≤ 15 MB, and otherwise take fewer notes.
  - Copy them to `priv/static/audio/music/piano/` as `<note>.mp3`, using `Cs4.mp3` for sharps.
- [ ] **Step 3: Credit them.** Add one `CREDITS.md` row per file (or one row covering the set) with the source URL, CC0 and today's date. Update the intro line that says no third-party audio is used.
- [ ] **Step 4: Wire the sampler.**
  - `makeInstrument("piano")` returns a `Tone.Sampler({ urls: PIANO_SAMPLES, baseUrl: PIANO_BASE_URL })`.
  - `engine.start` awaits `Tone.loaded()` while the status reads "loading piano…" (Review Focus 4).
  - Make piano the default instrument of the `notes` layer in `DEFAULT_SETTINGS`, but only if the samples were installed. Update the settings test's expectation accordingly.
- [ ] **Step 5: Verify in the browser.**
  - Load `/music` with the cache disabled (Playwright: a new context) and click Play immediately.
  - Expect the status "loading piano…", then piano notes and no console errors.
  - Re-run the `renderPeak` check and expect < 1.0.
- [ ] **Step 6: Run** all four checks, then **commit** `feat(music): VSCO2 CE upright piano sampler`. If Step 1 failed, commit as `feat(music): piano sampler path (samples not installed)` instead.

### Task 7: Drift, drift-on-drift, density drift

**Files:**
- Create: `assets/js/music_lab/audio/drift.ts`, `drift-math.ts`, `drift-math.test.ts`
- Modify: `engine.ts`, `control-defs.ts` (drift controls), `controls.ts` (a drift panel: add a drift, pick a target, set period and depth, enable, and choose "modulated by")

**Interfaces:**
- Produces:
  - `driftRange(target: DriftTarget, base: number, depth: number): [number, number]` (pure). The range is centred on the current setting, clamped to the target's legal range, and capped by `CAPS`. For example, `bus.delayFeedback` never exceeds 0.8.
  - `sineAt(periodSec: number, phase: number, t: number): number` (pure, returns [0, 1])
  - `class DriftRig { constructor(graph: StudioGraph, rng: Rng); apply(s: StudioSettings): void; densityAt(layerId: string, base: number, t: number): number; dispose(): void }`
    - Each audio target gets a `Tone.LFO({ min, max, frequency: 1 / periodSec, phase: rng.between(0, 360) })` connected to `graph.param(target)`.
    - **modulatedBy:** a second LFO drives the first LFO's `frequency`, between 0.5× and 2× its base frequency (Lesson 8's "LFO controlling another LFO").
    - **Density targets** don't use an LFO. `densityAt` computes `base` ± depth·0.5 via `sineAt`, and the engine passes it as the scheduler's `getDensity`.
    - **Disabling a drift:** disconnect the LFO, then ramp the param back to the base setting.
    - **Manual changes:** moving a control re-centres its LFO's min/max.

- [ ] **Step 1: Failing tests:** `driftRange` respects the caps (feedback base 0.7 with depth 1 gives max ≤ 0.8), stays inside the target range, and depth 0 gives `[base, base]`. `sineAt` has period 1000 → `sineAt(1000, 0, 250) ≈ 1`.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `drift-math.ts`, then `DriftRig`, and wire it into the engine and controls.
- [ ] **Step 4: Run** all four checks. Expected: PASS.
- [ ] **Step 5: Verify in the browser.**
  - Set a drift with period 10 s on `bus.reverbWet`. Over 20 s, sampling `graph.param('bus.reverbWet').value` through the hook should show it moving.
  - Run `renderPeak` with `extremeSettings()` plus every drift at depth 1 (Review Focus 5). Expect < 1.0.
- [ ] **Step 6: Commit** `feat(music): slow drift on any parameter, drift-on-drift`

### Task 8: Store, seed, share link, localStorage, recording

**Files:**
- Create: `share.ts`, `share.test.ts`, `store.ts`, `store.test.ts`, `audio/recorder.ts`
- Modify: `studio.ts`, `controls.ts` (seed field, "New seed", "Copy link", "● Record" / "■ Save recording"), `music.html.heex`

**Interfaces:**
- Produces:
  - `encodeShare(s: StudioSettings): string` returns `"v1." + base64url(JSON.stringify(s))`
  - `decodeShare(text: string): StudioSettings | null` returns `null` unless the text starts with `v1.` and parses. Otherwise it returns `normalizeSettings(parsed)`.
  - `class SettingsStore { constructor(initial: StudioSettings, persist: (s: StudioSettings) => void); get(): StudioSettings; set(next: StudioSettings): void; subscribe(fn: (s: StudioSettings) => void): () => void; beginPreview(): void; endPreview(keep: boolean): void; get previewing(): boolean }`
    - `set` calls `persist` unless it is previewing.
    - `endPreview(false)` restores the snapshot and notifies. `endPreview(true)` keeps the current state and persists it.
  - **Boot order:** URL `#s=` (via `decodeShare`), then localStorage key `"music-studio:v1"` (via `decodeShare`), then `DEFAULT_SETTINGS`.
  - **Persist:** write localStorage inside try/catch, and `history.replaceState` the `#s=` hash, debounced to 300 ms.
  - **Seed controls:** "New seed" sets `seed: randomSeed()`. Reshuffle is the same action.
  - `class StudioRecorder { constructor(source: Tone.ToneAudioNode); start(): void; stop(): Promise<Blob> }` wraps `Tone.Recorder` on the engine output. The download is named `music-studio-<seed>.webm`.

- [ ] **Step 1: Failing tests**

```ts
test("share round-trips", () => assert.deepEqual(decodeShare(encodeShare(DEFAULT_SETTINGS)), DEFAULT_SETTINGS));
test("bad share text → null", () => { for (const t of ["", "garbage", "v0.abc", "v1.!!!", "v1." + btoa("{\"version\":1")]) assert.equal(decodeShare(t), null); });  // Review Focus 2
test("share caps hostile values", () => assert.equal(decodeShare(encodeShare({ ...DEFAULT_SETTINGS, masterDb: 20 } as any))!.masterDb, -3));
test("store persists on set", ...);
test("preview does not persist and restores on endPreview(false)", ...);
test("endPreview(true) persists the previewed state once", ...);
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** and wire it into `studio.ts`. The engine subscribes to the store.
- [ ] **Step 4: Run** all four checks. Expected: PASS.
- [ ] **Step 5: Verify in the browser.**
  - Change settings and copy the link. Open it in a new Playwright context, and expect the same settings and seed. With the controls untouched, the first 10 logged notes should match the original tab's first 10 (same note names and times to 0.01 s from Play).
  - Load `/music#s=garbage` and expect defaults with no console error.
  - Record 5 s and expect a downloaded file larger than 0 bytes.
- [ ] **Step 6: Commit** `feat(music): seeds, share links, saved settings, recording`

### Task 9: Ripple visual and note log

**Files:**
- Create: `visual/layout.ts`, `visual/layout.test.ts`, `visual/ripples.ts`
- Modify: `studio.ts`, `music.html.heex`

**Interfaces:**
- Produces:
  - `rippleLayout(midi: number, layerIndex: number, layerCount: number, width: number, height: number): { x: number; y: number; maxRadius: number }` (pure)
    - x maps MIDI 24–108 linearly across the width with an 8% margin.
    - y is the centre of the layer's horizontal band.
    - `maxRadius` is `min(width, height) * 0.18`.
  - `class Ripples { constructor(canvas: HTMLCanvasElement); add(e: NoteEvent, layerIndex: number, layerCount: number): void; start(): void; stop(): void }`
    - It runs on `requestAnimationFrame`, and each ripple lasts 6 s.
    - Each ripple's alpha is `velocity·(1 − age/6)`, and its colour comes from a per-layer palette of warm tones matching the page.
    - It is DPR-aware and resizes with `ResizeObserver`.
    - With `prefers-reduced-motion`, ripples fade in place without expanding.
  - The note log (`<details data-log>`, collapsed) keeps the spike's format and its 40-line cap.

- [ ] **Step 1: Failing tests:** x is monotonic in midi and stays inside the margins at 24 and 108. Different layers get different y values, and every y is in (0, height).
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** and wire it into the engine's `onNote`.
- [ ] **Step 4: Run** all four checks. Expected: PASS.
- [ ] **Step 5: Verify in the browser.** Take screenshots at 1280 px and 390 px while playing. Expect visible ripples and no horizontal scroll at 390 px.
- [ ] **Step 6: Commit** `feat(music): ripple visual`

### Task 10: Guide entries, ⓘ panel, tour

**Files:**
- Create: `guide/entries.ts`, `guide/tour.ts`, `guide/guide.test.ts`, `ui/guide-panel.ts`, `ui/tour.ts`
- Modify: `studio.ts`, `music.html.heex` (a "Take the tour" button)

**Interfaces:**
- Produces:
  - `interface GuideEntry { id: string; title: string; body: string; source: string }`. `source` is `"Lesson 3"` … `"Lesson 9"` or `"Beyond the course"`.
  - `GUIDE_ENTRIES: Record<string, GuideEntry>` has exactly the ids listed in Task 5. Bodies are written from the course files in `../knowledge/building-generative-music-systems/`.
  - `scheduling-time` explains the `time` argument rule (Lesson 5). `timing-eno` cites Eno's quote and the 23.53 / 25.76 numbers.
  - `interface TourStep { entryId: string; focus: string | null; apply: (s: StudioSettings) => StudioSettings }`. `focus` is a `ControlDef.id`.
  - `TOUR_STEPS: TourStep[]`, in this order:
    1. silence: all layers muted, guide `layers`
    2. one sine note on the `notes` layer: instrument `tone`, a one-note set, guide `oscillator`
    3. piano: `sampler`
    4. note repeating: `scheduling-time`
    5. full Airports set in Eno mode: `timing-eno`
    6. `timing-random-once`
    7. `timing-random-every`
    8. reverb send up: `reverb`
    9. reverb drift: `drift`
    10. weights: `weights`
    11. chord changes: `chord-changes`
    12. unmute the drone and bells: `layers`
    13. drift-on-drift: `drift-on-drift`
    14. mood: `mood`
    15. seed: `seed`
    
    Use the note set id `single` (add `single: { label: "One note", notes: ["F4"] }` to `NOTE_SETS`).
  - `openGuide(entryId: string): void` and `closeGuide(): void` (in `guide-panel.ts`). The panel is non-modal, Escape closes it, and it never covers the transport.
  - `runTour(store: SettingsStore): void` (in `ui/tour.ts`)
    - It calls `store.beginPreview()` and applies each step cumulatively from the snapshot.
    - It highlights `[data-control=<focus>]` and shows the entry with Back / Next / Exit.
    - Exit offers "Back to my mix" (the default, `endPreview(false)`) or "Keep this sound" (`endPreview(true)`).
    - If audio isn't playing, the tour starts it.

- [ ] **Step 1: Failing tests**

```ts
test("every CONTROL_DEFS guide id has an entry", ...);
test("every entry has a title, a 2–4 sentence body, and a valid source", ...);
test("Lessons 3–9 each appear as a source at least once", ...);
test("tour steps reference existing entries and controls", ...);
test("applying tour steps cumulatively always yields normalized settings", () => { let s = DEFAULT_SETTINGS; for (const st of TOUR_STEPS) { s = st.apply(s); assert.deepEqual(normalizeSettings(s), s); } });
test("tour step 1 mutes every layer", ...);
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the entries (real prose), the steps, the panel and the tour UI.
- [ ] **Step 4: Run** all four checks. Expected: PASS.
- [ ] **Step 5: Verify in the browser.**
  - Click an ⓘ and expect the panel to open while the music keeps playing.
  - Run the tour through all 15 steps with Next. Exit with "Back to my mix", and expect the settings to equal those before the tour and localStorage to be unchanged.
  - Run it again and exit with "Keep this sound", and expect the settings to persist.
  - At 390 px width, expect the guide to show as a bottom sheet with the transport still reachable.
- [ ] **Step 6: Commit** `feat(music): in-page guide and tour`

### Task 11: Docs and final pass

**Files:** Modify `README.md` (add a "Music studio (/music)" section covering what it is, where the code lives and how to run `npm test` and the peak check), `CLAUDE.md` (`/music` is no longer a spike, there is now a JS test runner (`cd assets && npm test`, or `mix test.js`) for the pure modules, and `window.__musicStudio` is the inspection hook), and `docs/superpowers/specs/2026-11-01-music-studio-design.md` (set Status to "implemented" and note any deviations).

- [ ] **Step 1: Write the README section and update the spec status.**
- [ ] **Step 2: Run all four checks, then a 10-minute listen.** With Playwright, play `/music` with defaults for 10 minutes. Expect `__musicStudio` to show the transport still `started`, the log still growing and no console errors. Also run the `renderPeak` extreme check one last time.
- [ ] **Step 3: Commit** `docs(music): README for the music studio`
