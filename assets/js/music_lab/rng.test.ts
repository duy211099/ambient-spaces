import test from "node:test";
import assert from "node:assert/strict";
import { createRng, randomSeed } from "./rng.ts";

test("same seed gives same sequence", () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test("next() is in [0,1)", () => {
  const r = createRng(3);
  for (let i = 0; i < 1000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
  }
});

test("between stays in range", () => {
  const r = createRng(5);
  for (let i = 0; i < 1000; i++) {
    const v = r.between(2, 5);
    assert.ok(v >= 2 && v < 5);
  }
});

test("fork is deterministic and independent", () => {
  assert.equal(createRng(7).fork("bells").next(), createRng(7).fork("bells").next());
  assert.notEqual(createRng(7).fork("bells").next(), createRng(7).fork("drone").next());
});

test("weightedIndex follows weights", () => {
  const r = createRng(11);
  let hits = 0;
  for (let i = 0; i < 10_000; i++) if (r.weightedIndex([1, 3]) === 1) hits++;
  const share = hits / 10_000;
  assert.ok(share > 0.72 && share < 0.78, `share ${share}`);
});

test("weightedIndex never picks weight 0", () => {
  const r = createRng(13);
  for (let i = 0; i < 2000; i++) assert.notEqual(r.weightedIndex([0, 1, 0, 2]), 0);
  for (let i = 0; i < 2000; i++) assert.notEqual(r.weightedIndex([0, 1, 0, 2]), 2);
});

test("randomSeed is an integer in [1, 2^31-1]", () => {
  for (let i = 0; i < 200; i++) {
    const s = randomSeed();
    assert.ok(Number.isInteger(s) && s >= 1 && s <= 2 ** 31 - 1);
  }
});
