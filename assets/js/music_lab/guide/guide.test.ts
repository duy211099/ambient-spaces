import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings, type StudioSettings } from "../settings.ts";
import { CONTROL_DEFS, GUIDE_IDS, MODE_GUIDES } from "../ui/control-defs.ts";
import { GUIDE_ENTRIES } from "./entries.ts";
import { TOUR_STEPS } from "./tour.ts";

const sentences = (text: string): number => text.split(/(?<=[.!?])\s+(?=[A-Z"“])/).filter((x) => x.trim().length > 0).length;

test("every CONTROL_DEFS guide id has an entry", () => {
  const used = new Set([...CONTROL_DEFS.map((d) => d.guide), ...Object.values(MODE_GUIDES), "weights", "drift", "drift-on-drift"]);
  for (const id of used) assert.ok(GUIDE_ENTRIES[id], id);
  assert.deepEqual(Object.keys(GUIDE_ENTRIES).sort(), [...GUIDE_IDS].sort());
  for (const [id, e] of Object.entries(GUIDE_ENTRIES)) assert.equal(e.id, id);
});

test("every entry has a title, a 2–4 sentence body, and a valid source", () => {
  const sources = /^(Lesson [3-9]|Beyond the course)$/;
  for (const e of Object.values(GUIDE_ENTRIES)) {
    assert.ok(e.title.trim().length > 0, e.id);
    const n = sentences(e.body);
    assert.ok(n >= 2 && n <= 4, `${e.id}: ${n} sentences`);
    assert.match(e.source, sources, e.id);
  }
});

test("Lessons 3–9 each appear as a source at least once", () => {
  const used = new Set(Object.values(GUIDE_ENTRIES).map((e) => e.source));
  for (let n = 3; n <= 9; n++) assert.ok(used.has(`Lesson ${n}`), `Lesson ${n}`);
});

test("named entries carry the facts the brief asks for", () => {
  assert.match(GUIDE_ENTRIES["scheduling-time"].body, /time/);
  assert.equal(GUIDE_ENTRIES["scheduling-time"].source, "Lesson 5");
  assert.match(GUIDE_ENTRIES["timing-eno"].body, /23\.53/);
  assert.match(GUIDE_ENTRIES["timing-eno"].body, /25\.76/);
  assert.match(GUIDE_ENTRIES["timing-eno"].body, /incommensurable/);
  assert.match(GUIDE_ENTRIES.drift.body, /same target/);
  assert.match(GUIDE_ENTRIES.drift.body, /[Dd]ensity/);
});

test("tour steps reference existing entries and controls", () => {
  const order = ["layers", "oscillator", "sampler", "scheduling-time", "timing-eno", "timing-random-once", "timing-random-every",
    "reverb", "drift", "weights", "chord-changes", "layers", "drift-on-drift", "mood", "seed"];
  assert.deepEqual(TOUR_STEPS.map((s) => s.entryId), order);
  const ids = new Set(CONTROL_DEFS.map((d) => d.id));
  for (const st of TOUR_STEPS) {
    assert.ok(GUIDE_ENTRIES[st.entryId], st.entryId);
    if (st.focus !== null) assert.ok(ids.has(st.focus), st.focus);
  }
});

const run = (start: StudioSettings): StudioSettings[] => {
  const out: StudioSettings[] = [];
  let s = start;
  for (const st of TOUR_STEPS) {
    s = st.apply(s);
    out.push(s);
  }
  return out;
};

test("applying tour steps cumulatively always yields normalized settings", () => {
  const odd = normalizeSettings({
    ...structuredClone(DEFAULT_SETTINGS),
    layers: [{ ...DEFAULT_SETTINGS.layers[0], id: "other", weights: {} }],
    drifts: [{ id: "tour-reverb", target: "layer.other.volume", periodSec: 30, depth: 0.2, enabled: false, modulatedBy: null }],
  });
  for (const start of [DEFAULT_SETTINGS, odd]) {
    for (const s of run(start)) assert.deepEqual(normalizeSettings(s), s);
  }
});

test("tour step 1 mutes every layer", () => {
  const s = TOUR_STEPS[0].apply(DEFAULT_SETTINGS);
  assert.ok(s.layers.length > 0);
  for (const l of s.layers) assert.equal(l.muted, true);
});

test("tour builds up: one sine note, piano, Eno set, drift-on-drift, everything unmuted", () => {
  const before = structuredClone(DEFAULT_SETTINGS);
  const steps = run(DEFAULT_SETTINGS);
  assert.deepEqual(DEFAULT_SETTINGS, before);
  const notes = (s: StudioSettings) => s.layers.find((l) => l.id === "notes")!;
  assert.equal(notes(steps[1]).instrument, "tone");
  assert.deepEqual(notes(steps[1]).noteSetIds, ["single"]);
  assert.equal(notes(steps[1]).muted, false);
  assert.ok(steps[1].layers.filter((l) => l.id !== "notes").every((l) => l.muted));
  assert.equal(notes(steps[2]).instrument, "piano");
  assert.equal(notes(steps[4]).mode, "eno");
  assert.deepEqual(notes(steps[4]).noteSetIds, ["airports"]);
  assert.equal(notes(steps[5]).mode, "randomOnce");
  assert.equal(notes(steps[6]).mode, "randomEvery");
  assert.ok(steps[8].drifts.some((d) => d.target === "bus.reverbWet" && d.enabled));
  assert.equal(notes(steps[10]).noteSetIds.length, 2);
  assert.ok(steps[11].layers.every((l) => !l.muted));
  const reverb = steps[12].drifts.find((d) => d.target === "bus.reverbWet" && d.enabled)!;
  assert.ok(reverb.modulatedBy !== null && steps[12].drifts.some((d) => d.id === reverb.modulatedBy));
});
