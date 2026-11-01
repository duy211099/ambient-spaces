import test from "node:test";
import assert from "node:assert/strict";
import { SettingsStore } from "./store.ts";
import { DEFAULT_SETTINGS, type StudioSettings } from "./settings.ts";

const withSeed = (seed: number): StudioSettings => ({ ...DEFAULT_SETTINGS, seed });

function make() {
  const saved: StudioSettings[] = [];
  const seen: StudioSettings[] = [];
  const store = new SettingsStore(DEFAULT_SETTINGS, (s) => saved.push(s));
  store.subscribe((s) => seen.push(s));
  return { store, saved, seen };
}

test("store persists on set and notifies", () => {
  const { store, saved, seen } = make();
  store.set(withSeed(5));
  assert.equal(store.get().seed, 5);
  assert.deepEqual(saved.map((s) => s.seed), [5]);
  assert.deepEqual(seen.map((s) => s.seed), [5]);
});

test("unsubscribe stops notifications", () => {
  const { store, seen } = make();
  const off = store.subscribe(() => {});
  off();
  store.set(withSeed(2));
  assert.equal(seen.length, 1);
});

test("preview does not persist and restores on endPreview(false)", () => {
  const { store, saved, seen } = make();
  store.beginPreview();
  assert.equal(store.previewing, true);
  store.set(withSeed(9));
  assert.equal(seen.at(-1)!.seed, 9);
  assert.equal(saved.length, 0);
  store.endPreview(false);
  assert.equal(store.previewing, false);
  assert.equal(store.get().seed, DEFAULT_SETTINGS.seed);
  assert.equal(seen.at(-1)!.seed, DEFAULT_SETTINGS.seed);
  assert.equal(saved.length, 0);
});

test("endPreview(true) persists the previewed state once", () => {
  const { store, saved } = make();
  store.beginPreview();
  store.set(withSeed(3));
  store.set(withSeed(4));
  store.endPreview(true);
  assert.deepEqual(saved.map((s) => s.seed), [4]);
  assert.equal(store.get().seed, 4);
});

test("a second beginPreview keeps the first snapshot", () => {
  const { store } = make();
  store.beginPreview();
  store.set(withSeed(3));
  store.beginPreview();
  store.endPreview(false);
  assert.equal(store.get().seed, DEFAULT_SETTINGS.seed);
});

test("a throwing listener does not skip the others", () => {
  const { store, seen } = make();
  const err = console.error;
  console.error = () => {};
  try {
    store.subscribe(() => { throw new Error("boom"); });
    store.subscribe((s) => seen.push(s));
    store.set(withSeed(7));
  } finally {
    console.error = err;
  }
  assert.equal(seen.filter((s) => s.seed === 7).length, 2);
});
