import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, normalizeSettings, extremeSettings } from "./settings.ts";
import { NOTE_SETS } from "./notesets.ts";

test("DEFAULT_SETTINGS is already normalized", () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
});

test("caps are enforced", () => {
  const s = normalizeSettings({
    ...DEFAULT_SETTINGS,
    masterDb: 12,
    bus: { ...DEFAULT_SETTINGS.bus, delayFeedback: 2 },
    layers: [{ ...DEFAULT_SETTINGS.layers[0], volumeDb: 0 }],
  });
  assert.equal(s.masterDb, -3);
  assert.equal(s.bus.delayFeedback, 0.8);
  assert.equal(s.layers[0].volumeDb, -6);
});

test("low volumes clamp to the floor", () => {
  const s = normalizeSettings({
    ...DEFAULT_SETTINGS,
    masterDb: -100,
    layers: [{ ...DEFAULT_SETTINGS.layers[0], volumeDb: -100 }],
  });
  assert.equal(s.masterDb, -40);
  assert.equal(s.layers[0].volumeDb, -40);
});

test("garbage returns defaults", () => {
  for (const raw of [null, 42, "x", {}, { version: 0 }]) {
    assert.deepEqual(normalizeSettings(raw), DEFAULT_SETTINGS);
  }
});

test("non-numeric fields fall back instead of throwing", () => {
  const s = normalizeSettings({ ...DEFAULT_SETTINGS, masterDb: "loud", mood: NaN, layers: "nope" });
  assert.equal(s.masterDb, DEFAULT_SETTINGS.masterDb);
  assert.equal(s.mood, DEFAULT_SETTINGS.mood);
  assert.deepEqual(s.layers, DEFAULT_SETTINGS.layers);
});

test("unknown note-set ids are dropped; a layer left with none falls back to its default set", () => {
  const base = DEFAULT_SETTINGS.layers[1];
  const s = normalizeSettings({
    ...DEFAULT_SETTINGS,
    layers: [
      { ...base, noteSetIds: ["nope", "pentatonic", "bogus"] },
      { ...DEFAULT_SETTINGS.layers[2], noteSetIds: ["nope"] },
    ],
  });
  assert.deepEqual(s.layers[0].noteSetIds, ["pentatonic"]);
  assert.deepEqual(s.layers[1].noteSetIds, DEFAULT_SETTINGS.layers[2].noteSetIds);
});

test("weights clamp to 0.25..4", () => {
  const s = normalizeSettings({
    ...DEFAULT_SETTINGS,
    layers: [{ ...DEFAULT_SETTINGS.layers[1], weights: { C5: 100, F4: 0, Ab4: 2, bad: "x" } }],
  });
  const w = s.layers[0].weights;
  assert.equal(w.C5, 4);
  assert.equal(w.F4, 0.25);
  assert.equal(w.Ab4, 2);
  assert.equal("bad" in w, false);
});

test("drift pointing at a missing layer is dropped; modulatedBy pointing at a missing drift becomes null", () => {
  const s = normalizeSettings({
    ...DEFAULT_SETTINGS,
    drifts: [
      { id: "a", target: "layer.ghost.brightness", periodSec: 100, depth: 0.5, enabled: true, modulatedBy: null },
      { id: "b", target: "layer.notes.volume", periodSec: 100, depth: 0.5, enabled: true, modulatedBy: "a" },
      { id: "c", target: "bus.reverbWet", periodSec: 100, depth: 0.5, enabled: true, modulatedBy: "b" },
    ],
  });
  assert.deepEqual(s.drifts.map((d) => d.id), ["b", "c"]);
  assert.equal(s.drifts[0].modulatedBy, null);
  assert.equal(s.drifts[1].modulatedBy, "b");
});

test("extremeSettings is at the caps", () => {
  const s = extremeSettings();
  assert.equal(s.bus.delayFeedback, 0.8);
  assert.equal(s.masterDb, -3);
  assert.ok(s.layers.every((l) => l.volumeDb === -6 && l.density === 1 && l.brightness === 1 && !l.muted));
  assert.deepEqual(normalizeSettings(s), s);
});

test("prototype-chain names are not note-set ids", () => {
  const base = DEFAULT_SETTINGS.layers[1];
  const s = normalizeSettings({ ...DEFAULT_SETTINGS, layers: [{ ...base, noteSetIds: ["constructor", "__proto__", "toString"] }] });
  assert.deepEqual(s.layers[0].noteSetIds, base.noteSetIds);
});

test("modulatedBy self-reference and cycles are broken", () => {
  const d = (id: string, modulatedBy: string | null) => ({ id, target: "bus.reverbWet", periodSec: 100, depth: 0.5, enabled: true, modulatedBy });
  const self = normalizeSettings({ ...DEFAULT_SETTINGS, drifts: [d("a", "a")] });
  assert.equal(self.drifts[0].modulatedBy, null);
  const cyc = normalizeSettings({ ...DEFAULT_SETTINGS, drifts: [d("a", "b"), d("b", "a")] });
  assert.ok(cyc.drifts.some((x) => x.modulatedBy === null));
  assert.equal(cyc.drifts.length, 2);
});

test("duplicate layer ids keep the first", () => {
  const l = DEFAULT_SETTINGS.layers[1];
  const s = normalizeSettings({ ...DEFAULT_SETTINGS, layers: [{ ...l, label: "first" }, { ...l, label: "second" }] });
  assert.equal(s.layers.length, 1);
  assert.equal(s.layers[0].label, "first");
});

test("changeEverySec is sorted min/max", () => {
  const s = normalizeSettings({ ...DEFAULT_SETTINGS, layers: [{ ...DEFAULT_SETTINGS.layers[1], changeEverySec: [400, 100] }] });
  assert.deepEqual(s.layers[0].changeEverySec, [100, 400]);
});

test("seed is floored and clamped to [1, 2^31-1]", () => {
  assert.equal(normalizeSettings({ ...DEFAULT_SETTINGS, seed: 42.9 }).seed, 42);
  assert.equal(normalizeSettings({ ...DEFAULT_SETTINGS, seed: 0 }).seed, 1);
  assert.equal(normalizeSettings({ ...DEFAULT_SETTINGS, seed: 2 ** 40 }).seed, 2 ** 31 - 1);
});

test("structure caps: layers, label, drifts, weights", () => {
  const base = structuredClone(DEFAULT_SETTINGS);
  const layers = Array.from({ length: 5000 }, (_, i) => ({ ...base.layers[1], id: `l${i}`, label: "x".repeat(1000) }));
  const drifts = Array.from({ length: 100 }, (_, i) => ({ ...base.drifts[0], id: `d${i}` }));
  const out = normalizeSettings({ ...base, layers, drifts });
  assert.equal(out.layers.length, 8);
  assert.equal(out.layers[0].label.length, 40);
  assert.equal(out.drifts.length, 16);
  const notes = base.layers[1].noteSetIds.length ? NOTE_SETS[base.layers[1].noteSetIds[0]].notes : [];
  const weights: Record<string, number> = { bogus: 2 };
  for (let i = 0; i < 100; i++) weights[`k${i}`] = 2;
  for (const n of notes) weights[n] = 2;
  const w = normalizeSettings({ ...base, layers: [{ ...base.layers[1], weights }] }).layers[0].weights;
  assert.ok(Object.keys(w).length <= 32 && !("bogus" in w) && notes.every((n) => w[n] === 2));
});
