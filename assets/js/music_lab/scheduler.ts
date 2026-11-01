import type { Rng } from "./rng.ts";
import type { LayerSettings } from "./settings.ts";
import { NOTE_SETS } from "./notesets.ts";
import { effectiveLayer } from "./mood.ts";
import { enoLoops, enoScale, gapRange, randomOnceIntervals } from "./timing.ts";

export interface Clock {
  now(): number;
  scheduleOnce(cb: (time: number) => void, at: number): number;
  clear(id: number): void;
}

export interface NoteEvent {
  layerId: string;
  note: string;
  time: number;
  velocity: number;
}

export class LayerScheduler {
  private layer: LayerSettings | null = null;
  private activeSet = 0;
  private generation = 0;
  private noteGen = 0;
  private noteTimers = new Set<number>();
  private chordTimer: number | null = null;

  private clock: Clock;
  private rng: Rng;
  private onNote: (e: NoteEvent) => void;
  private getMood: () => number;
  private getDensity: (layer: LayerSettings, time: number) => number;

  constructor(
    clock: Clock,
    rng: Rng,
    onNote: (e: NoteEvent) => void,
    getMood: () => number,
    getDensity: (layer: LayerSettings, time: number) => number,
  ) {
    this.clock = clock;
    this.rng = rng;
    this.onNote = onNote;
    this.getMood = getMood;
    this.getDensity = getDensity;
  }

  start(layer: LayerSettings): void {
    this.reconfigure(layer);
  }

  reconfigure(layer: LayerSettings): void {
    this.layer = layer;
    this.generation++;
    this.clearNoteTimers();
    this.clearChordTimer();
    if (this.activeSet >= layer.noteSetIds.length) this.activeSet = 0;
    this.scheduleNotes(false);
    this.scheduleChordChange(this.generation, this.clock.now());
  }

  update(layer: LayerSettings): void {
    this.layer = layer;
  }

  stop(): void {
    this.generation++;
    this.clearNoteTimers();
    this.clearChordTimer();
  }

  pendingCount(): number {
    return this.noteTimers.size + (this.chordTimer === null ? 0 : 1);
  }

  activeNoteSet(): string {
    return this.layer ? this.layer.noteSetIds[this.clampedSet(this.layer)] : "";
  }

  private clampedSet(layer: LayerSettings): number {
    if (this.activeSet >= layer.noteSetIds.length) this.activeSet = 0;
    return this.activeSet;
  }

  private notes(): string[] {
    return this.layer ? NOTE_SETS[this.layer.noteSetIds[this.clampedSet(this.layer)]]?.notes ?? [] : [];
  }

  private clearNoteTimers(): void {
    for (const id of this.noteTimers) this.clock.clear(id);
    this.noteTimers.clear();
    this.noteGen++;
  }

  private clearChordTimer(): void {
    if (this.chordTimer !== null) this.clock.clear(this.chordTimer);
    this.chordTimer = null;
  }

  // Schedules one self-rescheduling timer chain per note. `staggered` is true after a chord change.
  private scheduleNotes(staggered: boolean, at0 = this.clock.now()): void {
    const layer = this.layer;
    if (!layer) return;
    const notes = this.notes();
    const now = at0;
    const gen = this.generation;
    const ng = this.noteGen;
    const weightOf = (note: string, l: LayerSettings) => l.weights[note] ?? 1;

    let nextAt: (i: number, time: number) => number;
    let firstAt: (i: number) => number;

    if (layer.mode === "eno") {
      const loops = enoLoops(notes.length, 0.5, this.rng);
      firstAt = (i) => now + loops[i].offset;
      nextAt = (i, time) => time + loops[i].interval * enoScale(this.getDensity(this.layer!, time));
    } else {
      const firstGap = (i: number) => {
        if (staggered) return this.rng.between(0, 8);
        if (i < 2) return this.rng.between(0.1, 3);
        const [, max] = gapRange(this.getDensity(layer, now), weightOf(notes[i], layer));
        return this.rng.between(0, max);
      };
      firstAt = (i) => now + firstGap(i);
      if (layer.mode === "randomOnce") {
        const weights = notes.map((n) => weightOf(n, layer));
        const intervals = randomOnceIntervals(notes.length, this.getDensity(layer, now), weights, this.rng);
        nextAt = (i, time) => time + intervals[i];
      } else {
        nextAt = (i, time) => {
          const l = this.layer!;
          const [lo, hi] = gapRange(this.getDensity(l, time), weightOf(notes[i], l));
          return time + this.rng.between(lo, hi);
        };
      }
    }

    const arm = (i: number, at: number) => {
      const id = this.clock.scheduleOnce((time) => {
        this.noteTimers.delete(id);
        if (gen !== this.generation || ng !== this.noteGen) return;
        this.fire(notes[i], time);
        arm(i, nextAt(i, time));
      }, at);
      this.noteTimers.add(id);
    };
    for (let i = 0; i < notes.length; i++) arm(i, firstAt(i));
  }

  private fire(note: string, time: number): void {
    const layer = this.layer;
    if (!layer || layer.muted) return;
    const [lo, hi] = effectiveLayer(layer, this.getMood()).velocity;
    this.onNote({ layerId: layer.id, note, time, velocity: this.rng.between(lo, hi) });
  }

  private scheduleChordChange(gen: number, from: number): void {
    const layer = this.layer;
    if (!layer || layer.noteSetIds.length < 2) return;
    const [lo, hi] = layer.changeEverySec;
    const at = from + this.rng.between(lo, hi);
    const id = this.clock.scheduleOnce((time) => {
      this.chordTimer = null;
      if (gen !== this.generation || !this.layer) return;
      this.activeSet = (this.activeSet + 1) % this.layer.noteSetIds.length;
      this.clearNoteTimers();
      this.scheduleNotes(true, time);
      this.scheduleChordChange(gen, time);
    }, at);
    this.chordTimer = id;
  }
}
