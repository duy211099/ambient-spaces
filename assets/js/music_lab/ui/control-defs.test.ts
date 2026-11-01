import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../settings.ts";
import {
  applyControl, CONTROL_DEFS, getPath, GUIDE_IDS, layerNotes, MODE_GUIDES, readControl, setPath,
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
