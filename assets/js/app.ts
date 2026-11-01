import { AudioEngine } from "./ambience/audio/engine";
import type { LayerId } from "./ambience/core/types";
import { Renderer } from "./ambience/scene/renderer";
import { ENTITY_REGISTRY } from "./ambience/scene/entities/registry";
import { Scene } from "./ambience/scene/scene";
import { SCENES } from "./ambience/scenes/registry";
import { loadMix, MixStore, saveMix } from "./ambience/state/mix";
import { Controls } from "./ambience/ui/controls";
import { bootMusicStudio } from "./music_lab/studio";

const SAVE_DEBOUNCE_MS = 200;

/** 0 = day, 1 = night, from the local clock. ?hour=0..23 overrides it for testing. */
function nightFactor(): number {
  const override = new URLSearchParams(window.location.search).get("hour");
  const parsed = override === null ? NaN : Number(override);
  const d = new Date();
  const hour = Number.isFinite(parsed) && parsed >= 0 && parsed < 24 ? parsed : d.getHours() + d.getMinutes() / 60;
  const ramp = (a: number, b: number, x: number): number => Math.min(1, Math.max(0, (x - a) / (b - a)));
  return hour < 12 ? 1 - ramp(5.5, 8, hour) : ramp(17, 20, hour);
}

function boot(): void {
  const stage = document.querySelector<HTMLElement>("[data-scene]");
  const canvas = document.querySelector<HTMLCanvasElement>("#scene-canvas");
  const controlsRoot = document.querySelector<HTMLElement>("#controls");
  if (!stage || !canvas || !controlsRoot) return;
  const cfg = SCENES[stage.dataset.scene ?? ""];
  if (!cfg) {
    console.warn(`[ambience] unknown scene "${stage.dataset.scene}"`);
    return;
  }

  const store = new MixStore(loadMix(cfg));
  const engine = new AudioEngine(cfg, store.get());
  const scene = new Scene(cfg, ENTITY_REGISTRY, store.get(), nightFactor());
  let playing = true;
  let started = false;
  let saveTimer = 0;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  scene.reduced = motion.matches;
  motion.addEventListener("change", () => {
    scene.reduced = motion.matches;
  });

  const controls = new Controls(controlsRoot, cfg, {
    onLayer: (id, value) => {
      store.dispatch({ type: "layer", id, value });
      void ensureStarted();
    },
    onMaster: (value) => {
      store.dispatch({ type: "master", value });
      void ensureStarted();
    },
    onWindow: (open) => {
      store.dispatch({ type: "window", open });
      void ensureStarted();
    },
    onPlayToggle: () => {
      if (!started) {
        void ensureStarted();
        return;
      }
      playing = !playing;
      sync();
    },
    onStart: () => void ensureStarted(),
  });

  new Renderer(canvas, scene, (id: LayerId) => controls.focusLayer(id));

  function sync(): void {
    const mix = store.get();
    engine.apply(mix, playing);
    scene.setMix(mix);
    controls.sync(mix, playing);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveMix(cfg, mix), SAVE_DEBOUNCE_MS);
  }

  async function ensureStarted(): Promise<void> {
    if (started) return;
    started = true;
    controls.setStarted(true);
    try {
      await engine.start();
      engine.apply(store.get(), playing);
    } catch (err) {
      console.warn("[ambience] audio could not start", err);
    }
  }

  store.subscribe(sync);
  canvas.addEventListener("click", () => void ensureStarted());
  sync();
  controls.setStarted(false);

  Object.assign(window, {
    __ambience: {
      audio: () => engine.snapshot(),
      levels: () => scene.levels(),
      mix: () => store.get(),
    },
  });
}

boot();
bootMusicStudio();
