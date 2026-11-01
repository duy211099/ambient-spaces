import type { StudioSettings } from "./settings.ts";

type Listener = (s: StudioSettings) => void;

export class SettingsStore {
  private state: StudioSettings;
  private persist: (s: StudioSettings) => void;
  private listeners = new Set<Listener>();
  private snapshot: StudioSettings | null = null;

  constructor(initial: StudioSettings, persist: (s: StudioSettings) => void) {
    this.state = initial;
    this.persist = persist;
  }

  get(): StudioSettings {
    return this.state;
  }

  get previewing(): boolean {
    return this.snapshot !== null;
  }

  set(next: StudioSettings): void {
    this.state = next;
    if (this.snapshot === null) this.persist(next);
    this.notify();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  beginPreview(): void {
    if (this.snapshot === null) this.snapshot = this.state;
  }

  endPreview(keep: boolean): void {
    const snap = this.snapshot;
    if (snap === null) return;
    this.snapshot = null;
    if (keep) {
      this.persist(this.state);
    } else {
      this.state = snap;
      this.notify();
    }
  }

  private notify(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(this.state);
      } catch (err) {
        console.error(err);
      }
    }
  }
}
