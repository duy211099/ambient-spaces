import type { NoteEvent } from "../scheduler.ts";
import { noteToMidi, rippleLayout } from "./layout.ts";

const LIFETIME_MS = 6000;
const MAX_RIPPLES = 64;
const PALETTE: [number, number, number][] = [
  [217, 166, 107],
  [226, 130, 92],
  [201, 160, 120],
  [235, 200, 140],
  [190, 120, 90],
  [240, 180, 120],
];

interface Ripple {
  x: number;
  y: number;
  maxRadius: number;
  velocity: number;
  rgb: [number, number, number];
  born: number;
}

export class Ripples {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private ripples: Ripple[] = [];
  private playing = false;
  private raf = 0;
  private reduced = false;
  private cssW = 0;
  private cssH = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduced = mq.matches;
    mq.addEventListener("change", (ev) => {
      this.reduced = ev.matches;
    });
    new ResizeObserver(() => this.resize()).observe(canvas);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.kick();
    });
    this.resize();
  }

  add(e: NoteEvent, layerIndex: number, layerCount: number): void {
    if (document.hidden || !this.cssW) return;
    const midi = noteToMidi(e.note);
    if (midi === null) return;
    const spot = rippleLayout(midi, layerIndex, layerCount, this.cssW, this.cssH);
    this.ripples.push({
      ...spot,
      velocity: Math.min(1, Math.max(0, e.velocity)),
      rgb: PALETTE[layerIndex % PALETTE.length] as [number, number, number],
      born: performance.now(),
    });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.splice(0, this.ripples.length - MAX_RIPPLES);
    this.kick();
  }

  start(): void {
    this.playing = true;
    this.kick();
  }

  /** Existing ripples fade out, then the loop halts. */
  stop(): void {
    this.playing = false;
  }

  private kick(): void {
    if (this.raf || document.hidden) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.cssW = this.canvas.clientWidth;
    this.cssH = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssH * dpr));
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.raf) this.draw(performance.now());
  }

  private frame(_t: number): void {
    this.raf = 0;
    if (document.hidden) return;
    const now = performance.now();
    this.ripples = this.ripples.filter((r) => now - r.born < LIFETIME_MS);
    this.draw(now);
    if (this.playing || this.ripples.length > 0) this.kick();
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    for (const r of this.ripples) {
      const k = (now - r.born) / LIFETIME_MS;
      if (k >= 1) continue;
      const alpha = r.velocity * (1 - k);
      const [R, G, B] = r.rgb;
      const radius = this.reduced ? r.maxRadius * 0.5 : r.maxRadius * (0.15 + 0.85 * Math.sqrt(k));
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      if (this.reduced) {
        ctx.fillStyle = `rgba(${R},${G},${B},${alpha * 0.5})`;
        ctx.fill();
      } else {
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(${R},${G},${B},${alpha})`;
        ctx.stroke();
      }
    }
  }
}
