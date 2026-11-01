import assert from "node:assert/strict";
import { test } from "node:test";
import { noteToMidi, rippleLayout } from "./layout.ts";

test("noteToMidi handles naturals, sharps and flats", () => {
  assert.equal(noteToMidi("C4"), 60);
  assert.equal(noteToMidi("A4"), 69);
  assert.equal(noteToMidi("Ab4"), 68);
  assert.equal(noteToMidi("C#5"), 73);
  assert.equal(noteToMidi("Bb2"), 46);
  assert.equal(noteToMidi("nope"), null);
});

test("x is monotonic in midi and inside the margins", () => {
  let prev = -Infinity;
  for (let m = 24; m <= 108; m++) {
    const { x } = rippleLayout(m, 0, 3, 1000, 200);
    assert.ok(x > prev);
    prev = x;
  }
  assert.ok(Math.abs(rippleLayout(24, 0, 3, 1000, 200).x - 80) < 1e-9);
  assert.ok(Math.abs(rippleLayout(108, 0, 3, 1000, 200).x - 920) < 1e-9);
});

test("layers get distinct y inside (0, height) and radius scales", () => {
  const ys = [0, 1, 2, 3].map((i) => rippleLayout(60, i, 4, 800, 200).y);
  assert.equal(new Set(ys).size, 4);
  for (const y of ys) assert.ok(y > 0 && y < 200);
  assert.equal(rippleLayout(60, 0, 4, 800, 200).maxRadius, 36);
});
