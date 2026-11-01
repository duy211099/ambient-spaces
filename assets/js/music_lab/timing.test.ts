import test from "node:test";
import assert from "node:assert/strict";
import { gapRange, enoScale, enoLoops, randomOnceIntervals } from "./timing.ts";
import { ENO_INTERVALS } from "./notesets.ts";
import { createRng } from "./rng.ts";

test("gapRange matches the spike at weight 1", () => {
  assert.deepEqual(gapRange(0, 1), [20, 40]);
  assert.deepEqual(gapRange(1, 1), [1.5, 4]);
});

test("heavier weight gives shorter gaps", () => {
  const [a] = gapRange(0.5, 1), [b] = gapRange(0.5, 2);
  assert.ok(b < a);
});

test("enoScale is 1 at density 0.5", () => assert.equal(enoScale(0.5), 1));

test("enoLoops uses Lesson 6 intervals at density 0.5", () =>
  assert.deepEqual(enoLoops(7, 0.5, createRng(1)).map((l) => l.interval), ENO_INTERVALS));

test("enoLoops keeps ratios when density changes", () => {
  const a = enoLoops(7, 0.2, createRng(1)), b = enoLoops(7, 0.9, createRng(1));
  const r = a[0].interval / b[0].interval;
  a.forEach((l, i) => assert.ok(Math.abs(l.interval / b[i].interval - r) < 1e-9));
});

test("enoLoops beyond 7 notes is seeded", () => {
  const a = enoLoops(10, 0.5, createRng(5)), b = enoLoops(10, 0.5, createRng(5));
  assert.equal(a.length, 10);
  assert.deepEqual(a, b);
  for (const l of a.slice(7)) {
    assert.ok(l.interval >= 16 && l.interval < 31);
    assert.ok(l.offset >= 0 && l.offset <= 20);
  }
});

test("randomOnceIntervals gives one in-range interval per note, seeded", () => {
  const w = [1, 2, 1];
  const a = randomOnceIntervals(4, 0.5, w, createRng(3));
  assert.deepEqual(a, randomOnceIntervals(4, 0.5, w, createRng(3)));
  assert.equal(a.length, 4);
  a.forEach((v, i) => {
    const [lo, hi] = gapRange(0.5, w[i] ?? 1);
    assert.ok(v >= lo && v <= hi);
  });
});
