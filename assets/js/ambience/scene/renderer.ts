import type { LayerId, Rect } from "../core/types";
import type { Scene } from "./scene";
import { MAX_PARALLAX } from "./entities/geometry";

interface View {
  scale: number;
  ox: number;
  oy: number;
}

const PARALLAX_EASE = 0.06;
const MAX_DPR = 2;

const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Canvas loop, resize, parallax pointer and hit testing. Knows nothing about what is drawn. */
export class Renderer {
  private readonly g: CanvasRenderingContext2D;
  private view: View = { scale: 1, ox: 0, oy: 0 };
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private target = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private readonly onHit: (id: LayerId) => void,
  ) {
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Canvas 2D is not available");
    this.g = g;
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVisibility);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("click", this.onClick);
    this.resize();
  }

  start(): void {
    if (this.raf === 0 && !document.hidden) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private onVisibility = (): void => {
    if (document.hidden) this.stop();
    else this.start();
  };

  private tick = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const p = this.scene.parallax;
    if (this.scene.reduced) {
      p.x = 0;
      p.y = 0;
    } else {
      p.x += (this.target.x - p.x) * PARALLAX_EASE;
      p.y += (this.target.y - p.y) * PARALLAX_EASE;
    }
    this.scene.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    const { g, view, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#2b1d17";
    g.fillRect(0, 0, this.cssW, this.cssH);
    g.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
    this.scene.draw(g, MAX_PARALLAX);
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.max(1, Math.round(this.cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.cssH * this.dpr));
    const { w, h } = this.scene.config.size;
    const portrait = this.cssH > this.cssW;
    const scale = Math.max(this.cssW / w, Math.min(this.cssH / h, this.cssW / (w * 0.6)));
    this.view = {
      scale,
      ox: (this.cssW - w * scale) / 2,
      oy: (this.cssH - h * scale) * (portrait ? 0.3 : 0.5),
    };
    if (this.raf === 0 && !document.hidden) this.draw();
  };

  private toScene(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.view.ox) / this.view.scale, y: (e.clientY - r.top - this.view.oy) / this.view.scale };
  }

  private hitTest(e: PointerEvent | MouseEvent): LayerId | null {
    const p = this.toScene(e);
    const layer = this.scene.config.layers.find((l) => inside(l.hit, p.x, p.y));
    return layer ? layer.id : null;
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.target = {
      x: (e.clientX / this.cssW) * 2 - 1,
      y: (e.clientY / this.cssH) * 2 - 1,
    };
    this.canvas.style.cursor = this.hitTest(e) ? "pointer" : "default";
  };

  private onPointerLeave = (): void => {
    this.target = { x: 0, y: 0 };
  };

  private onClick = (e: MouseEvent): void => {
    const id = this.hitTest(e);
    if (id) this.onHit(id);
  };
}
