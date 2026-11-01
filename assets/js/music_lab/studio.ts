import { StudioEngine } from "./audio/engine.ts";
import { renderPeak } from "./audio/offline.ts";
import { randomSeed } from "./rng.ts";
import type { NoteEvent } from "./scheduler.ts";
import { DEFAULT_SETTINGS, extremeSettings, normalizeSettings, type StudioSettings } from "./settings.ts";
import { renderControls } from "./ui/controls.ts";

const LOG_LINES = 50;

type Status = "stopped" | "loading…" | "playing";

export function bootMusicStudio(): void {
  const root = document.getElementById("music-studio");
  if (!root) return;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const controlsRoot = q("[data-controls]");
  const statusEl = q("[data-status]");
  const logEl = q("[data-log-lines]");
  if (!controlsRoot || !statusEl) return;

  let current: StudioSettings = normalizeSettings(structuredClone(DEFAULT_SETTINGS));
  let status: Status = "stopped";
  const logLines: string[] = [];

  const getStatus = (): Status => status;
  const setStatus = (s: Status) => {
    status = s;
    statusEl.textContent = s;
  };

  const onNote = (e: NoteEvent & { layerIndex: number }) => {
    // layerIndex stays available for the visual drawing added later.
    const layer = current.layers[e.layerIndex];
    logLines.push(`${new Date().toLocaleTimeString()}  ${layer?.label ?? e.layerId}  ${e.note}`);
    if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES);
    if (logEl) logEl.textContent = logLines.join("\n");
  };

  const engine = new StudioEngine(onNote);
  const controls = renderControls(controlsRoot, current, (next) => change(next));

  function change(next: StudioSettings): void {
    current = normalizeSettings(next);
    controls.sync(current);
    if (status === "playing") engine.apply(current);
  }

  async function play(): Promise<void> {
    if (status !== "stopped") return;
    setStatus("loading…");
    const started = current;
    try {
      await engine.start(started);
    } catch (err) {
      console.error(err);
      setStatus("stopped");
      return;
    }
    if (getStatus() !== "loading…") return; // stopped while loading
    if (!engine.playing) return setStatus("stopped");
    setStatus("playing");
    if (current !== started) engine.apply(current); // edited while loading
  }

  function stop(): void {
    engine.stop();
    setStatus("stopped");
  }

  q("[data-play]")?.addEventListener("click", () => void play());
  q("[data-stop]")?.addEventListener("click", stop);
  q("[data-reshuffle]")?.addEventListener("click", () => change({ ...current, seed: randomSeed() }));

  Object.assign(window, {
    __musicStudio: { settings: () => current, renderPeak, extremeSettings },
  });
}
