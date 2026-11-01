# Music Studio (/music): design

Date: 2026-11-01
Status: implemented

## Intent

`/music` is currently a throwaway spike (commit `cda730f`,
`assets/js/music_lab/lab.ts`): one note set on independent timers, three
synth instruments, a low-pass filter, a reverb with an optional 2-minute LFO,
and a row of dots that flash per note.

The user wants to turn it into an in-depth page that holds everything taught
in the course "Building Generative Music Systems"
(`../knowledge/building-generative-music-systems/`, by Alex Bainter) plus
extras that go beyond it. The user chose the shape **"Studio with a guide"**
over a chapter-by-chapter tutorial or a pure instrument:

- a deep generative studio you can press play on and leave running, and
- a guide built into it that explains any control you touch and can tour the
  ideas one at a time.

Why: the user is exploring what this knowledge makes possible before deciding
what to build with it in other places (cafe scene, a game). The studio is the
place to hear, learn and test every idea by ear.

## Goals

1. Every concept in the course is present as something you can hear and
   control (see "Course coverage" below).
2. Extras beyond the course: layers, weighted notes, chord changes, slow drift
   on any parameter, a mood control, seeds and share links, recording, a
   reactive visual.
3. A guide: an ⓘ on each control opens a side panel saying what the idea is,
   why it works, and which lesson it comes from (or "beyond the course"). A
   tour starts from silence and switches ideas on one by one so you hear each
   change.
4. It sounds good left alone for an hour: calm, never harsh, never obviously
   repeating.

## Non-goals (for this design)

- Wiring into the cafe scene's "cafe music" layer.
- Multi-user / shared live music through Phoenix.
- Any server-side state, accounts or database. The page stays static.
- MIDI, user sample upload, mobile background playback.

These are listed under "What can enhance next".

## Anti-goals (would make it a failure even if it works)

- Sudden loud or harsh sounds; clipping. The master must stay safe at any
  control setting.
- The guide getting in the way of listening (modal popups, forced tour,
  walls of text).
- A control panel so dense the page stops feeling calm.
- Breaking the cafe scene at `/` (shared bundle, shared `app.ts`).

## Constraints

- Lives in the existing Phoenix 1.7 app `living_ambience`, route `GET /music`,
  template `music.html.heex`, booted from `assets/js/app.ts`.
- TypeScript, bundled by Phoenix's esbuild, checked with `npx tsc --noEmit`.
- Tone.js is already a dependency (`tone ^15.1.22`) and stays the audio
  library. No new runtime npm dependencies without a reason.
- Audio files follow `CREDITS.md`: CC0 only, recorded with source URL in the
  same commit. Files go under `priv/static/audio/`.
- Browser autoplay rules: audio starts only after a user gesture.
- Checks that exist today: `mix compile --warnings-as-errors`, `mix test`,
  `mix typecheck`. There is no JS unit-test runner yet.

## Course coverage (what each lesson becomes on the page)

| Lesson | Idea | On the page |
|---|---|---|
| 3 Making sound | Oscillator → destination | Tour step 1: a single test tone; the "basic synth" instrument |
| 4 Samplers | `Tone.Sampler`, repitching nearest sample | Real upright-piano instrument from samples |
| 5 Scheduling | Transport, `time` argument, `scheduleOnce` / `scheduleRepeat` | The note log shows scheduled times; guide entry on the `time` rule |
| 6 Music for Airports | Incommensurable fixed loops (23.5 s, 25 7/8 s…) | Timing mode "Eno tape loops", including Eno's actual intervals as a preset |
| 7 More Airports | Random intervals at start; fresh random gap after every note | Timing modes "random once" and "random every note" (three modes total) |
| 8 Effects | Freeverb, wet/dry, LFO on effect params | Effects chain with Freeverb option; drift on wet, room size, dampening |
| 9 Your turn / cheatsheet ideas | Weighted notes, chord switching, random effect params, LFO on LFO, custom samples | Weights per note, chord changes, "LFO controls LFO speed" drift option |

## Extras beyond the course

- **Layers.** Several layers play at once, each with its own notes,
  instrument, timing and level. Ships with three: a low drone, the main notes,
  occasional bells. Add, remove and mute layers.
- **Weighted notes.** Each note has a weight; heavier notes play more often,
  giving the piece a home.
- **Chord / note-set changes.** Every few minutes (random, within a range) a
  layer may move to another note set from a small list, crossfading rather
  than cutting.
- **Drift on anything.** Any continuous parameter (filter, reverb wet, room
  size, delay feedback, layer volume, density) can be given a slow drift with
  its own period, including one drift modulating another drift's speed.
- **Mood.** One control, calm ↔ restless, that moves density, brightness,
  reverb and velocity range together. Manual controls still work underneath.
- **Seed.** All randomness comes from a seeded generator. The same seed plus
  the same settings replays the same piece from the start. Shown on screen,
  editable, "new seed" button.
- **Share link.** Seed and settings encoded in the URL; opening the link
  restores them. Last-used settings also remembered in localStorage.
- **Record.** Record what you hear to a downloadable audio file.
- **Visual.** A canvas where each note blooms as a soft ripple, colored by
  layer, positioned by pitch, fading slowly. Replaces the dot row as the main
  visual; the note log stays, collapsed by default.

## The guide

- Content is data: one entry per concept with title, 2–4 sentence plain
  explanation, source ("Lesson 6" or "Beyond the course"), and the control(s)
  it belongs to.
- ⓘ next to a control opens that entry in a side panel (bottom sheet on narrow
  screens). The panel never covers the transport or blocks sound.
- **Tour.** Optional, started by a button. Starts from silence and walks
  through the ideas in course order, then the extras: each step changes the
  live settings, highlights the control, and shows its entry. Next/back/exit.
  Exiting keeps whatever is playing.

## Decided by the user

- Shape: Studio with a guide (option C).
- Scope: all course knowledge plus extras.
- Chùa Online is out (its docs were deleted).

## My calls (the user can override)

- Stay in `living_ambience` on Tone.js; keep `/music` separate from the cafe
  scene for now.
- Piano samples: the VSCO 2 Community Edition upright piano (CC0), a subset of
  roughly 10–15 notes, compressed (ogg or mp3), under
  `priv/static/audio/music/piano/`, recorded in `CREDITS.md`. If the CC0
  status can't be confirmed at the source, stop and ask instead of adding
  them. The synth instruments stay as alternatives.
- Seeded randomness and URL settings, so share links are possible without a
  server.
- The current spike code is replaced, not preserved; its ideas carry over.
- Visual is plain Canvas 2D, not Phaser (no game loop needed).
- Master protected by a limiter so no setting can clip.

### Engine decisions (my calls, settled after a builder review)

- **Timing stays per note, as in the course.** Every note in a layer has its
  own timer. This is the heart of the course and what the guide explains.
  - **Random modes:** a note's weight scales its own gap, so heavier notes
    get shorter gaps and play more often. Density and Mood scale all gaps.
  - **Eno loops mode:** weights are ignored. Density and Mood multiply every
    loop length by the same factor, so the ratios between loops stay
    incommensurable. The guide says this.
  - **Chord / note-set change:** retire the old note timers (their notes ring
    out) and start new ones with staggered random starts. That is the
    crossfade.
- **Seeded replay means: same seed and same settings give the same piece,
  as long as nobody touches a control.**
  - Live control moves are not recorded.
  - A share link captures the seed and the current settings and starts the
    piece fresh from them.
  - Each layer gets its own RNG stream derived from the seed. Chord-change
    timing and drift starting phases are drawn from the seed too.
  - "Reshuffle" picks a new seed.
- **Audio graph:** each layer has its own instrument, filter, volume and a
  send level. All layers feed one shared delay → reverb bus (Freeverb or
  `Tone.Reverb` selectable), which feeds the master limiter. Per-layer
  "wetness" is the send level. There are no per-layer reverbs, to keep
  hour-long runs light.
- **Safety beyond the limiter:** delay feedback is capped at 0.8, filter
  resonance is capped low, and per-layer and master gains are capped in
  dB.
- **Piano samples:**
  - Fetch from the VSCO 2 CE source and confirm the CC0 license there.
  - If confirmed, add the subset and record it in `CREDITS.md`.
  - If the license can't be confirmed or the download fails, ship step 3
    synth-only, with the Sampler path in place behind a flag. Note it as a
    follow-up. Don't block the build.
- **Verification:**
  - Each step is listened to in the browser.
  - Plus one automated check: a short `Tone.Offline` render at extreme
    settings (max density, max feedback, max brightness, all layers loud)
    run in the browser through Playwright. It asserts the peak stays under
    0 dBFS.
  - Pure logic (seeded RNG, weighted choice, URL encode/decode) gets unit
    tests if a dev-only runner is cheap to add.
- **Tour and your mix:**
  - Starting the tour snapshots the current settings.
  - On exit it offers "Keep this sound" or "Back to my mix" (the default).
  - Tour state is never written to localStorage or the URL until you choose
    "Keep".

## Left to the builder

- Module layout inside `assets/js/music_lab/` and the settings data model.
- Exact default note sets, intervals and drift periods, as long as the
  defaults sound calm.
- URL encoding format, recording file format, visual details.
- Whether to add a small JS test runner for the pure logic (seeded RNG,
  weighted choice, settings encode/decode); recommended if cheap.
- Wording of guide entries (plain, short, no jargon).

## Build order (what we do)

Each step ends playable in the browser and passes the existing checks.

1. **Groundwork.** Split the spike into modules (engine, scheduling, settings,
   UI), add the seeded random generator and the master limiter. Sound is
   unchanged.
2. **Layers.** Multiple layers with their own notes, instrument, timing and
   level; three timing modes (Eno loops, random once, random every note).
3. **Sound.** Piano samples, effects chain (filter → delay → reverb, Freeverb
   option), weighted notes, chord changes.
4. **Drift and mood.** Drift on any parameter, drift-on-drift, the mood
   control.
5. **Keep and share.** Seed UI, URL settings, localStorage, recording.
6. **Visual.** Ripple canvas, collapsible log.
7. **Guide.** Entries for every concept, ⓘ panel, tour.

## What can enhance next (after this design ships)

- **Cafe scene music.** Use the studio's engine as the cafe's "cafe music"
  layer, reacting to the rain slider and time of day.
- **Shared radio.** Phoenix holds the seed and clock so everyone on the page
  hears the same piece live; visitors nudge it together through a channel.
- **Game soundtrack.** Per-area layer setups that crossfade as the player
  moves, for the Crashlands-style game idea.
- **Phrases.** Short 2–4 note motifs instead of single notes.
- **Your own samples.** Drop in an audio file and play it as an instrument.
- **Long renders.** Render 30–60 minutes offline to a file.
- **MIDI out** to drive external synths.
- **Saved presets gallery** of seeds you liked.

## Deviations

- Share links enforce structural caps: at most 8 layers and 16 drifts.
- One drift per target. Density drifts ignore "modulated by".
- A drift enabled mid-play sweeps centred on the current value.
- The tour exit defaults to "Back to my mix". Nothing is persisted until "Keep this sound".
- The note log shows the scheduled time as `t=`.
- The cafe `.panel` CSS clashed, so the studio uses `.studio-panel`.
