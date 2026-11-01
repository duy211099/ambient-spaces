import { StudioEngine } from "./audio/engine.ts";
import { renderPeak } from "./audio/offline.ts";
import { usesPiano } from "./piano.ts";
import { randomSeed } from "./rng.ts";
import type { NoteEvent } from "./scheduler.ts";
import { DEFAULT_SETTINGS, extremeSettings, normalizeSettings, type StudioSettings } from "./settings.ts";
import { decodeShare, encodeShare } from "./share.ts";
import { SettingsStore } from "./store.ts";
import { renderControls } from "./ui/controls.ts";
import { extensionFor, StudioRecorder } from "./audio/recorder.ts";

const LOG_LINES = 50;
const NOTE_LOG_MAX = 500;
const STORAGE_KEY = "music-studio:v1";
const HASH_PREFIX = "#s=";
const PERSIST_DEBOUNCE_MS = 300;

function loadInitial(): StudioSettings {
  if (location.hash.startsWith(HASH_PREFIX)) {
    const fromUrl = decodeShare(location.hash.slice(HASH_PREFIX.length));
    if (fromUrl) return fromUrl;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const fromStorage = saved === null ? null : decodeShare(saved);
    if (fromStorage) return fromStorage;
  } catch {
    /* storage blocked */
  }
  return normalizeSettings(structuredClone(DEFAULT_SETTINGS));
}

function makePersist(): (s: StudioSettings) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (s) => {
    const text = encodeShare(s);
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      /* storage blocked or full */
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        history.replaceState(history.state, "", `${location.pathname}${location.search}${HASH_PREFIX}${text}`);
      } catch {
        /* replaceState can throw in sandboxed frames */
      }
    }, PERSIST_DEBOUNCE_MS);
  };
}

type Status = "stopped" | "loading…" | "loading piano…" | "playing";

export function bootMusicStudio(): void {
  const root = document.getElementById("music-studio");
  if (!root) return;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const controlsRoot = q("[data-controls]");
  const statusEl = q("[data-status]");
  const logEl = q("[data-log-lines]");
  if (!controlsRoot || !statusEl) return;

  const store = new SettingsStore(loadInitial(), makePersist());
  const noteLog: { note: string; layerId: string; time: number }[] = [];
  let status: Status = "stopped";
  const logLines: string[] = [];

  const getStatus = (): Status => status;
  const setStatus = (s: Status) => {
    status = s;
    statusEl.textContent = s;
  };

  const onNote = (e: NoteEvent & { layerIndex: number }) => {
    // layerIndex stays available for the visual drawing added later.
    if (noteLog.length < NOTE_LOG_MAX) noteLog.push({ note: e.note, layerId: e.layerId, time: Math.round(e.time * 100) / 100 });
    const layer = store.get().layers[e.layerIndex];
    logLines.push(`${new Date().toLocaleTimeString()}  ${layer?.label ?? e.layerId}  ${e.note}`);
    if (logLines.length > LOG_LINES) logLines.splice(0, logLines.length - LOG_LINES);
    if (logEl) logEl.textContent = logLines.join("\n");
  };

  const engine = new StudioEngine(onNote);
  const controls = renderControls(controlsRoot, store.get(), (next) => change(next));
  store.subscribe((s) => {
    controls.sync(s);
    if (status === "playing") engine.apply(s);
  });

  function change(next: StudioSettings): void {
    store.set(normalizeSettings(next));
  }

  async function play(): Promise<void> {
    if (status !== "stopped") return;
    const started = store.get();
    const loading: Status = usesPiano(started.layers) ? "loading piano…" : "loading…";
    setStatus(loading);
    try {
      await engine.start(started);
    } catch (err) {
      console.error(err);
      setStatus("stopped");
      return;
    }
    if (getStatus() !== loading) return; // stopped while loading
    if (!engine.playing) return setStatus("stopped");
    setStatus("playing");
    syncRecordButton();
    if (store.get() !== started) engine.apply(store.get()); // edited while loading
  }

  function stop(): void {
    if (recording) void finishRecording();
    engine.stop();
    setStatus("stopped");
    syncRecordButton();
  }

  const recordBtn = q<HTMLButtonElement>("[data-record]");
  const copyStatus = q("[data-copy-status]");
  const linkInput = q<HTMLInputElement>("[data-link-input]");
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let recorder: StudioRecorder | null = null;
  let recording = false;

  function syncRecordButton(): void {
    if (!recordBtn) return;
    recordBtn.disabled = status !== "playing";
    recordBtn.textContent = recording ? "■ Save recording" : "● Record";
  }

  function startRecording(): void {
    if (recording || status !== "playing") return;
    try {
      recorder = new StudioRecorder(engine.output);
      recorder.start();
      recording = true;
    } catch (err) {
      console.error(err);
      recorder?.dispose();
      recorder = null;
    }
    syncRecordButton();
  }

  async function finishRecording(): Promise<void> {
    const rec = recorder;
    if (!rec) return;
    recorder = null;
    recording = false;
    syncRecordButton();
    try {
      const blob = await rec.stop();
      const mime = rec.mimeType || blob.type;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `music-studio-${store.get().seed}.${extensionFor(mime)}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error(err);
    } finally {
      rec.dispose();
    }
  }

  async function copyLink(): Promise<void> {
    const url = `${location.origin}${location.pathname}${location.search}${HASH_PREFIX}${encodeShare(store.get())}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      /* fall back to a selectable field */
    }
    if (linkInput) {
      linkInput.value = url;
      linkInput.hidden = ok;
      if (!ok) {
        linkInput.focus();
        linkInput.select();
      }
    }
    if (copyStatus) {
      copyStatus.textContent = ok ? "copied" : "press Ctrl+C to copy";
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        if (copyStatus) copyStatus.textContent = "";
      }, 2500);
    }
  }

  q("[data-play]")?.addEventListener("click", () => void play());
  q("[data-stop]")?.addEventListener("click", stop);
  q("[data-reshuffle]")?.addEventListener("click", () => change({ ...store.get(), seed: randomSeed() }));
  q("[data-copy-link]")?.addEventListener("click", () => void copyLink());
  recordBtn?.addEventListener("click", () => {
    if (recording) void finishRecording();
    else startRecording();
  });
  syncRecordButton();

  Object.assign(window, {
    __musicStudio: { settings: () => store.get(), notes: () => noteLog.slice(), renderPeak, extremeSettings, engine, change: (next: StudioSettings) => change(next) },
  });
}
