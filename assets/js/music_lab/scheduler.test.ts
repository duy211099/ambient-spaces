import test from "node:test";
import assert from "node:assert/strict";
import { LayerScheduler } from "./scheduler.ts";
import type { Clock, NoteEvent } from "./scheduler.ts";
import { createRng } from "./rng.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";
import type { LayerSettings } from "./settings.ts";
import { NOTE_SETS } from "./notesets.ts";

class FakeClock implements Clock {
  private t = 0;
  private nextId = 1;
  private queue: { id: number; at: number; cb: (time: number) => void }[] = [];
  now() { return this.t; }
  scheduleOnce(cb: (time: number) => void, at: number) {
    const id = this.nextId++;
    this.queue.push({ id, at, cb });
    this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
    return id;
  }
  clear(id: number) { this.queue = this.queue.filter((e) => e.id !== id); }
  pending() { return this.queue.length; }
  advance(seconds: number) {
    const end = this.t + seconds;
    while (this.queue.length && this.queue[0].at <= end) {
      const e = this.queue.shift()!;
      this.t = Math.max(this.t, e.at);
      e.cb(e.at);
    }
    this.t = end;
  }
}

const base = DEFAULT_SETTINGS.layers[1];
const layer: LayerSettings = { ...base, mode: "randomEvery", noteSetIds: ["airports"], muted: false, density: 0.5 };
const chordLayer: LayerSettings = { ...layer, noteSetIds: ["airports", "airportsAlt"], changeEverySec: [30, 60] };

function setup(seed = 1) {
  const clock = new FakeClock();
  const events: NoteEvent[] = [];
  const s = new LayerScheduler(clock, createRng(seed), (e) => events.push(e), () => 0.5, (l) => l.density);
  return { clock, events, s };
}

test("one pending timer per note after start", () => {
  const { clock, s } = setup();
  s.start(layer);
  assert.equal(clock.pending(), 7);
});

test("randomEvery plays every note within 3x max gap", () => {
  const { clock, events, s } = setup();
  s.start(layer);
  clock.advance(120);
  const seen = new Set(events.map((e) => e.note));
  for (const n of NOTE_SETS.airports.notes) assert.ok(seen.has(n), n);
});

test("same seed gives same first 50 note events", () => {
  const run = (seed: number) => {
    const { clock, events, s } = setup(seed);
    s.start(layer);
    clock.advance(3000);
    return events.slice(0, 50).map((e) => [e.note, e.time.toFixed(6)]);
  };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7), run(8));
});

test("eno mode at density 0.5 plays F4 at 0, 23.53, 47.06", () => {
  const { clock, events, s } = setup();
  s.start({ ...layer, mode: "eno" });
  clock.advance(48);
  const f4 = events.filter((e) => e.note === "F4").map((e) => e.time);
  assert.equal(f4.length, 3);
  assert.ok(Math.abs(f4[0] - 0) < 1e-9);
  assert.ok(Math.abs(f4[1] - 23.53) < 1e-9);
  assert.ok(Math.abs(f4[2] - 47.06) < 1e-9);
});

test("randomOnce notes repeat at fixed intervals", () => {
  const { clock, events, s } = setup();
  s.start({ ...layer, mode: "randomOnce" });
  clock.advance(600);
  const f4 = events.filter((e) => e.note === "F4").map((e) => e.time);
  assert.ok(f4.length >= 3);
  const g1 = f4[1] - f4[0];
  assert.ok(Math.abs(f4[2] - f4[1] - g1) < 1e-9);
});

test("weight 4 note plays at least 2.5x as often as weight 1 over 1 simulated hour", () => {
  const { clock, events, s } = setup(3);
  s.start({ ...layer, weights: { F4: 4 } });
  clock.advance(3600);
  const count = (n: string) => events.filter((e) => e.note === n).length;
  const others = NOTE_SETS.airports.notes.filter((n) => n !== "F4");
  const avg = others.reduce((a, n) => a + count(n), 0) / others.length;
  assert.ok(count("F4") / avg >= 2.5, `${count("F4")} vs ${avg}`);
});

test("muted layer emits nothing but keeps its timers", () => {
  const { clock, events, s } = setup();
  s.start({ ...layer, muted: true });
  clock.advance(600);
  assert.equal(events.length, 0);
  assert.equal(clock.pending(), 7);
  s.update({ ...layer, muted: false });
  clock.advance(600);
  assert.ok(events.length > 0);
});

test("velocity comes from the mood range", () => {
  const { clock, events, s } = setup();
  s.start(layer);
  clock.advance(300);
  assert.ok(events.length > 0);
  for (const e of events) assert.ok(e.velocity >= 0.3 && e.velocity <= 0.7);
});

test("reconfigure 50 times keeps one timer per note", () => {
  const { clock, s } = setup();
  s.start(layer);
  for (let i = 0; i < 50; i++) s.reconfigure({ ...layer, mode: i % 2 ? "eno" : "randomEvery" });
  assert.equal(clock.pending(), 7);
});

test("start twice does not stack timers", () => {
  const { clock, s } = setup();
  s.start(layer);
  s.start(layer);
  assert.equal(clock.pending(), 7);
});

test("simulated hour keeps pending events bounded", () => {
  const { clock, s } = setup();
  s.start(chordLayer);
  const largest = Math.max(...chordLayer.noteSetIds.map((id) => NOTE_SETS[id].notes.length));
  for (let i = 0; i < 60; i++) {
    clock.advance(60);
    assert.ok(clock.pending() <= largest + 1);
  }
});

test("chord change switches set and reschedules only notes", () => {
  const { clock, s } = setup();
  s.start(chordLayer);
  assert.equal(s.activeNoteSet(), "airports");
  clock.advance(chordLayer.changeEverySec[1] + 0.001);
  assert.equal(s.activeNoteSet(), "airportsAlt");
  assert.equal(clock.pending(), NOTE_SETS.airportsAlt.notes.length + 1);
});

test("update does not reschedule", () => {
  const { clock, s } = setup();
  s.start(layer);
  s.update({ ...layer, density: 1 });
  assert.equal(clock.pending(), 7);
});

test("stop clears everything", () => {
  const { clock, s } = setup();
  s.start(chordLayer);
  s.stop();
  assert.equal(clock.pending(), 0);
  assert.equal(s.pendingCount(), 0);
});
