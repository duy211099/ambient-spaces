import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../settings.ts";
import {
  addLayer, applyControl, CONTROL_DEFS, getPath, getWeight, GUIDE_IDS, layerNotes, MAX_LAYERS, MODE_GUIDES, readControl, removeLayer, setPath, setWeight,
} from "./control-defs.ts";

test("every control has a unique id and a guide id from the fixed list", () => {
  const ids = CONTROL_DEFS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of CONTROL_DEFS) assert.ok((GUIDE_IDS as readonly string[]).includes(d.guide), d.id);
  for (const g of Object.values(MODE_GUIDES)) assert.ok((GUIDE_IDS as readonly string[]).includes(g));
  assert.equal(CONTROL_DEFS.find((d) => d.id === "mode")?.guide, "timing-eno");
});

test("every path resolves on DEFAULT_SETTINGS (layer paths on layers[0])", () => {
  for (const d of CONTROL_DEFS) {
    const root = d.scope === "layer" ? DEFAULT_SETTINGS.layers[0] : DEFAULT_SETTINGS;
    assert.notEqual(getPath(root, d.path), undefined, d.id);
  }
});

test("setPath is immutable", () => {
  const before = structuredClone(DEFAULT_SETTINGS);
  const next = setPath(DEFAULT_SETTINGS, "bus.reverbSize", 0.1);
  assert.deepEqual(DEFAULT_SETTINGS, before);
  assert.equal(next.bus.reverbSize, 0.1);
  assert.notEqual(next.bus, DEFAULT_SETTINGS.bus);
  assert.equal(next.layers, DEFAULT_SETTINGS.layers);
  const arr = setPath(DEFAULT_SETTINGS.layers[0], "noteSetIds.0", "night");
  assert.equal(arr.noteSetIds[0], "night");
  assert.equal(DEFAULT_SETTINGS.layers[0].noteSetIds[0], "drone");
});

test("chordChanges toggles between one set and two", () => {
  const def = CONTROL_DEFS.find((d) => d.id === "chordChanges")!;
  const off = applyControl(DEFAULT_SETTINGS, def, false, 1);
  assert.deepEqual(off.layers[1].noteSetIds, ["airports"]);
  assert.equal(readControl(def, off, off.layers[1]), false);
  const on = applyControl(off, def, true, 1);
  assert.deepEqual(on.layers[1].noteSetIds, ["airports", "pentatonic"]);
  const onOther = applyControl({ ...off, layers: [{ ...off.layers[0], noteSetIds: ["airports"] }] }, def, true, 0);
  assert.equal(onOther.layers[0].noteSetIds[1], "pentatonic");
  const p = applyControl(off, def, true, 1).layers[1].noteSetIds;
  assert.notEqual(p[0], p[1]);
});

test("noteSet replaces only the first set; layerNotes unions and dedupes", () => {
  const def = CONTROL_DEFS.find((d) => d.id === "noteSet")!;
  const next = applyControl(DEFAULT_SETTINGS, def, "night", 1);
  assert.deepEqual(next.layers[1].noteSetIds, ["night", "airportsAlt"]);
  const notes = layerNotes(DEFAULT_SETTINGS.layers[1]);
  assert.equal(new Set(notes).size, notes.length);
  assert.ok(notes.includes("Ab5") && notes.includes("Db4"));
  assert.equal(notes.indexOf("F4"), 0);
});

test("picking the second chord set as the first never duplicates", () => {
  const def = CONTROL_DEFS.find((d) => d.id === "noteSet")!;
  const next = applyControl(DEFAULT_SETTINGS, def, "airportsAlt", 1);
  const ids = next.layers[1].noteSetIds;
  assert.equal(ids[0], "airportsAlt");
  assert.notEqual(ids[1], "airportsAlt");
  assert.equal(ids.length, 2);
});

test("addLayer copies notes with a unique id, capped at MAX_LAYERS", () => {
  let s = addLayer(DEFAULT_SETTINGS);
  assert.equal(s.layers.length, 4);
  assert.equal(s.layers[3].id, "layer4");
  assert.deepEqual(s.layers[3].noteSetIds, DEFAULT_SETTINGS.layers[1].noteSetIds);
  assert.equal(DEFAULT_SETTINGS.layers.length, 3);
  while (s.layers.length < MAX_LAYERS) s = addLayer(s);
  assert.equal(new Set(s.layers.map((l) => l.id)).size, MAX_LAYERS);
  assert.equal(addLayer(s), s);
});

test("removeLayer drops one layer but never the last", () => {
  const s = removeLayer(DEFAULT_SETTINGS, "notes");
  assert.deepEqual(s.layers.map((l) => l.id), ["drone", "bells"]);
  const one = { ...DEFAULT_SETTINGS, layers: [DEFAULT_SETTINGS.layers[0]] };
  assert.equal(removeLayer(one, "drone"), one);
});

test("setWeight is immutable and getWeight defaults to 1", () => {
  const s = setWeight(DEFAULT_SETTINGS, "notes", "F4", 2);
  assert.equal(getWeight(s.layers[1], "F4"), 2);
  assert.equal(getWeight(DEFAULT_SETTINGS.layers[1], "F4"), 1);
  assert.equal(setWeight(DEFAULT_SETTINGS, "nope", "F4", 2), DEFAULT_SETTINGS);
  const def = { ...CONTROL_DEFS[0], id: "weight-F4", scope: "layer" as const, path: "weights.F4" };
  assert.equal(readControl(def, DEFAULT_SETTINGS, DEFAULT_SETTINGS.layers[1]), 1);
});
