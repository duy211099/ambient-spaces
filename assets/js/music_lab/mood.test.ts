import test from "node:test";
import assert from "node:assert/strict";
import { effectiveLayer } from "./mood.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

const layer = DEFAULT_SETTINGS.layers[1];

test("mood 0.5 leaves the layer unchanged", () => {
  const e = effectiveLayer(layer, 0.5);
  assert.equal(e.density, layer.density);
  assert.equal(e.brightness, layer.brightness);
  assert.equal(e.send, layer.send);
});

test("mood 1 is busier, brighter, drier, louder than mood 0", () => {
  const lo = effectiveLayer(layer, 0), hi = effectiveLayer(layer, 1);
  assert.ok(hi.density > lo.density);
  assert.ok(hi.brightness > lo.brightness);
  assert.ok(hi.send < lo.send);
  assert.ok(hi.velocity[0] > lo.velocity[0]);
  assert.ok(hi.velocity[1] > lo.velocity[1]);
});

test("effectiveLayer stays in range at extremes", () => {
  for (const base of [0, 1]) {
    for (const mood of [0, 1]) {
      const e = effectiveLayer({ ...layer, density: base, brightness: base, send: base }, mood);
      for (const v of [e.density, e.brightness, e.send]) assert.ok(v >= 0 && v <= 1);
      for (const v of e.velocity) assert.ok(v >= 0.1 && v <= 1);
    }
  }
});

test("effectiveLayer is pure", () => {
  const before = structuredClone(layer);
  effectiveLayer(layer, 0.9);
  assert.deepEqual(layer, before);
});
