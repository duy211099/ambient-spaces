import test from "node:test";
import assert from "node:assert/strict";
import { decodeShare, encodeShare } from "./share.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";

test("share round-trips", () => assert.deepEqual(decodeShare(encodeShare(DEFAULT_SETTINGS)), DEFAULT_SETTINGS));

test("share uses url-safe characters and a v1 prefix", () => {
  const text = encodeShare({ ...DEFAULT_SETTINGS, seed: 123456 });
  assert.match(text, /^v1\.[A-Za-z0-9_-]+$/);
});

test("share round-trips non-ascii labels", () => {
  const s = structuredClone(DEFAULT_SETTINGS);
  s.layers[0].label = "Drône ✿";
  assert.equal(decodeShare(encodeShare(s))!.layers[0].label, "Drône ✿");
});

test("bad share text → null", () => {
  for (const t of ["", "garbage", "v0.abc", "v1.!!!", "v1." + btoa("{\"version\":1"), "v1." + btoa("5"), "v1." + btoa("{}")]) {
    assert.equal(decodeShare(t), null, t);
  }
});

test("share caps hostile values", () => {
  assert.equal(decodeShare(encodeShare({ ...DEFAULT_SETTINGS, masterDb: 20 } as any))!.masterDb, -3);
});
