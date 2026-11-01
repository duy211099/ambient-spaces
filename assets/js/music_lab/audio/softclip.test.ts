import assert from "node:assert/strict";
import { test } from "node:test";
import { layerHeadroomGain, SOFT_CLIP_KNEE, SOFT_CLIP_RANGE, softClip, softClipCurve } from "./softclip.ts";

test("no input reaches full scale", () => {
  for (const x of [0.99, 1, 1.5, 2.31, 10.6, 1e6, Infinity]) {
    assert.ok(Math.abs(softClip(x)) < 1, `${x}`);
    assert.ok(Math.abs(softClip(-x)) < 1, `-${x}`);
  }
  const curve = softClipCurve(8193);
  assert.ok(curve.every((v) => Math.abs(v) < 1));
});

test("quiet signal passes through unchanged", () => {
  for (const x of [0, 0.01, -0.1, 0.3, -0.5, SOFT_CLIP_KNEE]) assert.equal(softClip(x), x);
  // just above the knee it is still within 0.5% of the input
  assert.ok(Math.abs(softClip(0.6) - 0.6) / 0.6 < 0.005);
});

test("the curve is monotonic and odd", () => {
  const curve = softClipCurve(8193);
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1]);
  for (let i = 0; i < curve.length; i++) assert.ok(curve[i] === -curve[curve.length - 1 - i]);
});

test("the curve maps its sample positions through softClip", () => {
  const n = 8193;
  const curve = softClipCurve(n);
  assert.equal(curve[(n - 1) / 2], 0);
  // fed input / SOFT_CLIP_RANGE, sample i sits at input SOFT_CLIP_RANGE * (2i/(n-1) - 1)
  const i = (n - 1) / 2 + 128;
  const x = SOFT_CLIP_RANGE * ((2 * i) / (n - 1) - 1);
  assert.equal(curve[i], Math.fround(softClip(x)));
  assert.ok(Math.abs(curve[i] - x) < 1e-6); // inside the knee: identity
});

test("the default piece gets no headroom trim; more layers are trimmed in power", () => {
  for (const n of [0, 1, 2, 3]) assert.equal(layerHeadroomGain(n), 1);
  assert.ok(Math.abs(layerHeadroomGain(6) ** 2 * 6 - 3) < 1e-12);
  assert.ok(layerHeadroomGain(8) < layerHeadroomGain(4) && layerHeadroomGain(4) < 1);
});
