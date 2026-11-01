import Phaser from "phaser";
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
const BACKDROP = "backdrop";

const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * Phaser game that owns the loop, resize, parallax pointer and hit testing.
 * The cafe entities still draw with Canvas 2D into a texture that sits behind any future sprites.
 */
export class Renderer {
  private readonly stage: HTMLElement;
  private view: View = { scale: 1, ox: 0, oy: 0 };
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private target = { x: 0, y: 0 };
  private backdrop: Phaser.Textures.CanvasTexture | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private readonly onHit: (id: LayerId) => void,
  ) {
    this.stage = canvas.parentElement ?? document.body;
    this.measure();
    const self = this;
    new Phaser.Game({
      type: Phaser.CANVAS,
      canvas,
      width: Math.round(this.cssW * this.dpr),
      height: Math.round(this.cssH * this.dpr),
      backgroundColor: "#2b1d17",
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / this.dpr },
      input: {
        mouse: { preventDefaultDown: false, preventDefaultUp: false, preventDefaultMove: false, preventDefaultWheel: false },
        touch: { capture: false },
      },
      scene: {
        create(this: Phaser.Scene) {
          self.create(this);
        },
        update(this: Phaser.Scene, _time: number, delta: number) {
          self.tick(delta / 1000);
        },
      },
    });
  }

  private create(phaser: Phaser.Scene): void {
    this.backdrop = phaser.textures.createCanvas(BACKDROP, phaser.scale.width, phaser.scale.height);
    phaser.add.image(0, 0, BACKDROP).setOrigin(0, 0);
    phaser.input.on("pointermove", this.onPointerMove);
    phaser.input.on("pointerup", this.onPointerUp);
    phaser.input.on("gameout", this.onPointerLeave);
    window.addEventListener("resize", () => this.resize(phaser));
    this.resize(phaser);
  }

  private tick(seconds: number): void {
    const dt = Math.min(0.05, Math.max(0, seconds));
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
  }

  private draw(): void {
    if (!this.backdrop) return;
    const g = this.backdrop.getContext();
    const { view, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#2b1d17";
    g.fillRect(0, 0, this.cssW, this.cssH);
    g.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.ox, dpr * view.oy);
    this.scene.draw(g, MAX_PARALLAX);
    this.backdrop.refresh();
  }

  private measure(): void {
    const rect = this.stage.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const { w, h } = this.scene.config.size;
    const portrait = this.cssH > this.cssW;
    const scale = Math.max(this.cssW / w, Math.min(this.cssH / h, this.cssW / (w * 0.6)));
    this.view = {
      scale,
      ox: (this.cssW - w * scale) / 2,
      oy: (this.cssH - h * scale) * (portrait ? 0.3 : 0.5),
    };
  }

  private resize(phaser: Phaser.Scene): void {
    this.measure();
    const width = Math.round(this.cssW * this.dpr);
    const height = Math.round(this.cssH * this.dpr);
    phaser.scale.setZoom(1 / this.dpr);
    phaser.scale.resize(width, height);
    this.backdrop?.setSize(width, height);
    this.draw();
  }

  private sceneHit(pointer: Phaser.Input.Pointer): LayerId | null {
    const x = (pointer.x / this.dpr - this.view.ox) / this.view.scale;
    const y = (pointer.y / this.dpr - this.view.oy) / this.view.scale;
    const layer = this.scene.config.layers.find((l) => inside(l.hit, x, y));
    return layer ? layer.id : null;
  }

  private onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    this.target = {
      x: (pointer.x / this.dpr / this.cssW) * 2 - 1,
      y: (pointer.y / this.dpr / this.cssH) * 2 - 1,
    };
    this.canvas.style.cursor = this.sceneHit(pointer) ? "pointer" : "default";
  };

  private onPointerLeave = (): void => {
    this.target = { x: 0, y: 0 };
  };

  private onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    const id = this.sceneHit(pointer);
    if (id) this.onHit(id);
  };
}
