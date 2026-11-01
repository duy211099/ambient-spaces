// THROWAWAY SPIKE: a playground for the generative music ideas from
// knowledge/building-generative-music-systems. Not wired into the scenes.
import * as Tone from "tone";

type Mode = "random" | "loops";
type InstrumentId = "piano" | "pad" | "bell";

interface Preset {
  label: string;
  notes: string[];
}

const PRESETS: Record<string, Preset> = {
  airports: { label: "Music for Airports 2/1 (Eno)", notes: ["F4", "Ab4", "C5", "Db5", "Eb5", "F5", "Ab5"] },
  pentatonic: { label: "C major pentatonic", notes: ["C4", "D4", "E4", "G4", "A4", "C5", "D5"] },
  night: { label: "Night (A minor)", notes: ["A3", "C4", "E4", "G4", "B4", "E5"] },
  nguCung: { label: "Ngũ cung (Vietnamese pentatonic)", notes: ["C4", "D4", "F4", "G4", "A4", "C5", "D5"] },
};

const INSTRUMENTS: Record<InstrumentId, { label: string; make: () => Tone.PolySynth }> = {
  piano: {
    label: "Soft keys",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.005, decay: 2.5, sustain: 0, release: 3 },
      }),
  },
  pad: {
    label: "Warm pad",
    make: () =>
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "fatsine", count: 3, spread: 20 },
        envelope: { attack: 2.5, decay: 1, sustain: 0.6, release: 6 },
      }),
  },
  bell: {
    label: "Temple bell",
    make: () =>
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 12,
        envelope: { attack: 0.002, decay: 4, sustain: 0, release: 5 },
        modulationEnvelope: { attack: 0.002, decay: 1.5, sustain: 0, release: 2 },
      }),
  },
};

interface Settings {
  preset: string;
  instrument: InstrumentId;
  mode: Mode;
  density: number; // 0 sparse .. 1 busy
  brightness: number; // 0 dark .. 1 bright
  reverb: number; // 0 dry .. 1 wet
  drift: boolean; // LFO slowly moves reverb wet
  volume: number; // dB
}

const settings: Settings = {
  preset: "airports",
  instrument: "piano",
  mode: "random",
  density: 0.35,
  brightness: 0.6,
  reverb: 0.5,
  drift: true,
  volume: -14,
};

function getRandomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Delay range in seconds for the current density: sparse ~20-40s, busy ~1.5-4s. */
function delayRange(): [number, number] {
  const d = settings.density;
  const min = 20 - d * 18.5;
  const max = 40 - d * 36;
  return [min, max];
}

function cutoffHz(): number {
  return 300 * Math.pow(2, settings.brightness * 6); // 300 Hz .. 19.2 kHz
}

let synth: Tone.PolySynth | null = null;
let filter: Tone.Filter;
let reverb: Tone.Reverb;
let lfo: Tone.LFO;
let started = false;
let generation = 0; // bump to orphan old scheduled chains

const els = {
  root: () => document.querySelector<HTMLElement>("#music-lab")!,
};

function buildChain(): void {
  filter = new Tone.Filter({ type: "lowpass", frequency: cutoffHz(), rolloff: -12 });
  reverb = new Tone.Reverb({ decay: 9, preDelay: 0.05, wet: settings.reverb });
  lfo = new Tone.LFO({ min: 0.15, max: 0.85, frequency: 1 / 120 }); // 2-minute cycle
  filter.connect(reverb);
  reverb.toDestination();
  Tone.getDestination().volume.value = settings.volume;
  setInstrument(settings.instrument);
  applyDrift();
}

function setInstrument(id: InstrumentId): void {
  synth?.releaseAll();
  const old = synth;
  synth = INSTRUMENTS[id].make();
  synth.maxPolyphony = 24;
  synth.volume.value = -8;
  synth.connect(filter);
  if (old) setTimeout(() => old.dispose(), 8000);
}

function applyDrift(): void {
  if (settings.drift) {
    lfo.connect(reverb.wet);
    lfo.start();
  } else {
    lfo.stop();
    lfo.disconnect();
    reverb.wet.cancelScheduledValues(Tone.now());
    reverb.wet.rampTo(settings.reverb, 0.5);
  }
}

function play(note: string, time: number, voiceIndex: number): void {
  if (!synth) return;
  const velocity = getRandomBetween(0.35, 0.8);
  const length = settings.instrument === "pad" ? getRandomBetween(4, 8) : 3;
  synth.triggerAttackRelease(note, length, time, velocity);
  Tone.getDraw().schedule(() => flash(voiceIndex, note), time);
}

/** Lesson 7: schedule forever with a fresh random gap after every note. */
function scheduleRandomRepeat(fn: (time: number) => void, startTime: number, gen: number): void {
  Tone.getTransport().scheduleOnce((time) => {
    if (gen !== generation) return;
    fn(time);
    const [min, max] = delayRange();
    scheduleRandomRepeat(fn, time + getRandomBetween(min, max), gen);
  }, startTime);
}

function scheduleAll(): void {
  const transport = Tone.getTransport();
  transport.cancel(0);
  generation += 1;
  const gen = generation;
  const now = transport.seconds;
  const notes = PRESETS[settings.preset].notes;
  renderVoices(notes);
  notes.forEach((note, i) => {
    const [min, max] = delayRange();
    const start = now + (i < 2 ? getRandomBetween(0.1, 3) : getRandomBetween(0, max));
    if (settings.mode === "random") {
      scheduleRandomRepeat((t) => play(note, t, i), start, gen);
    } else {
      // Lesson 6/7a: one fixed, odd interval per note, chosen at start.
      const interval = getRandomBetween(min, max) + Math.random();
      transport.scheduleRepeat((t) => play(note, t, i), interval, start);
    }
  });
}

async function start(): Promise<void> {
  await Tone.start();
  if (!started) {
    buildChain();
    await reverb.ready;
    started = true;
  }
  scheduleAll();
  Tone.getTransport().start();
  setStatus("playing");
}

function stop(): void {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel(0);
  generation += 1;
  synth?.releaseAll();
  setStatus("stopped");
}

// ---------- UI ----------

function renderVoices(notes: string[]): void {
  const box = els.root().querySelector<HTMLElement>("[data-voices]")!;
  box.innerHTML = "";
  notes.forEach((note, i) => {
    const v = document.createElement("div");
    v.className = "voice";
    v.dataset.voice = String(i);
    v.innerHTML = `<span class="voice__dot"></span><span class="voice__note">${note}</span><span class="voice__count">0</span>`;
    box.appendChild(v);
  });
}

function flash(i: number, note: string): void {
  const v = els.root().querySelector<HTMLElement>(`[data-voice="${i}"]`);
  if (v) {
    v.classList.remove("voice--hit");
    void v.offsetWidth;
    v.classList.add("voice--hit");
    const c = v.querySelector<HTMLElement>(".voice__count")!;
    c.textContent = String(Number(c.textContent) + 1);
  }
  const log = els.root().querySelector<HTMLElement>("[data-log]")!;
  const line = document.createElement("div");
  line.textContent = `${Tone.getTransport().seconds.toFixed(1).padStart(6)}s  ${note}`;
  log.prepend(line);
  while (log.childElementCount > 40) log.lastElementChild?.remove();
}

function setStatus(s: string): void {
  els.root().querySelector<HTMLElement>("[data-status]")!.textContent = s;
}

function describeDensity(): string {
  const [min, max] = delayRange();
  return `${min.toFixed(1)}–${max.toFixed(1)}s between hits per note`;
}

function bindRange(name: keyof Settings, onChange: (v: number) => void, describe?: () => string): void {
  const input = els.root().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  const out = els.root().querySelector<HTMLElement>(`[data-out="${name}"]`);
  input.value = String(settings[name]);
  const update = () => {
    const v = Number(input.value);
    (settings as unknown as Record<string, number>)[name] = v;
    if (out) out.textContent = describe ? describe() : input.value;
    if (started) onChange(v);
  };
  input.addEventListener("input", update);
  if (out) out.textContent = describe ? describe() : input.value;
}

function bindSelect(name: keyof Settings, options: Record<string, { label: string }>, onChange: () => void): void {
  const sel = els.root().querySelector<HTMLSelectElement>(`[name="${name}"]`)!;
  sel.innerHTML = Object.entries(options)
    .map(([id, o]) => `<option value="${id}">${o.label}</option>`)
    .join("");
  sel.value = String(settings[name]);
  sel.addEventListener("change", () => {
    (settings as unknown as Record<string, string>)[name] = sel.value;
    if (started) onChange();
  });
}

export function bootMusicLab(): void {
  const root = document.querySelector<HTMLElement>("#music-lab");
  if (!root) return;

  bindSelect("preset", PRESETS, () => scheduleAll());
  bindSelect("instrument", INSTRUMENTS, () => setInstrument(settings.instrument));
  bindSelect("mode", { random: { label: "Random gap after every note (never repeats)" }, loops: { label: "Fixed odd loops (Eno tape loops)" } }, () => scheduleAll());
  bindRange("density", () => undefined, describeDensity);
  bindRange("brightness", () => filter.frequency.rampTo(cutoffHz(), 0.3), () => `${Math.round(cutoffHz())} Hz`);
  bindRange("reverb", (v) => {
    if (!settings.drift) reverb.wet.rampTo(v, 0.3);
  });
  bindRange("volume", (v) => Tone.getDestination().volume.rampTo(v, 0.1), () => `${settings.volume} dB`);

  const drift = root.querySelector<HTMLInputElement>('[name="drift"]')!;
  drift.checked = settings.drift;
  drift.addEventListener("change", () => {
    settings.drift = drift.checked;
    if (started) applyDrift();
  });

  root.querySelector("[data-play]")!.addEventListener("click", () => void start());
  root.querySelector("[data-stop]")!.addEventListener("click", stop);
  root.querySelector("[data-reshuffle]")!.addEventListener("click", () => {
    if (started) scheduleAll();
  });

  renderVoices(PRESETS[settings.preset].notes);
  Object.assign(window, { __musicLab: { settings, transport: () => Tone.getTransport().state } });
}
