import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPS } from "../settings.ts";
import { centredRange, driftRange, legalRange, sineAt } from "./drift-math.ts";

test("feedback never exceeds the cap", () => {
  const [lo, hi] = driftRange("bus.delayFeedback", 0.7, 1);
  assert.ok(hi <= CAPS.delayFeedbackMax);
  assert.ok(lo >= 0);
});

test("layer volume stays inside the layer range", () => {
  const [lo, hi] = driftRange("layer.a.volume", -8, 1);
  assert.ok(hi <= CAPS.layerDb[1]);
  assert.ok(lo >= CAPS.layerDb[0]);
});

test("every target stays inside its legal range at depth 1", () => {
  for (const target of ["bus.reverbWet", "bus.reverbSize", "bus.dampening", "bus.delayFeedback", "layer.a.brightness", "layer.a.volume", "layer.a.density"] as const) {
    const [min, max] = legalRange(target);
    for (const base of [min, (min + max) / 2, max]) {
      const [lo, hi] = driftRange(target, base, 1);
      assert.ok(lo >= min && hi <= max && lo <= hi, `${target} ${base}`);
    }
  }
});

test("depth 0 gives a flat range", () => {
  assert.deepEqual(driftRange("bus.reverbWet", 0.5, 0), [0.5, 0.5]);
  assert.deepEqual(driftRange("bus.dampening", 3000, 0), [3000, 3000]);
});

test("range is half the legal span times depth", () => {
  const [lo, hi] = driftRange("bus.reverbWet", 0.5, 0.5);
  assert.ok(Math.abs(lo - 0.25) < 1e-9 && Math.abs(hi - 0.75) < 1e-9);
});

test("sineAt peaks a quarter period in and stays in [0, 1]", () => {
  assert.ok(Math.abs(sineAt(1000, 0, 250) - 1) < 1e-9);
  assert.ok(Math.abs(sineAt(1000, 0, 0) - 0.5) < 1e-9);
  for (let t = 0; t < 2000; t += 37) {
    const v = sineAt(1000, 1.3, t);
    assert.ok(v >= 0 && v <= 1);
  }
});

test("centredRange is symmetric about the value and stays inside the range", () => {
  assert.deepEqual(centredRange(0, 1, 0.5), [0, 1]);
  const [lo, hi] = centredRange(0, 0.75, 0.35);
  assert.ok(Math.abs((lo + hi) / 2 - 0.35) < 1e-9);
  assert.ok(lo >= 0 && hi <= 0.75);
  assert.ok(Math.abs(hi - lo - 0.7) < 1e-9);
  assert.deepEqual(centredRange(0, 1, 0), [0, 0]);
  assert.deepEqual(centredRange(0.2, 0.4, 5), [5, 5]);
});
