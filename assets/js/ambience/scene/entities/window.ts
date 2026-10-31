import type { Entity, Frame } from "../entity";
import { FRAME_PAD, lowerSash, MAX_PARALLAX, OPENING, SILL_Y, UPPER_SASH } from "./geometry";
import { glow, mixColor, rrect } from "./common";

const SKY_DAY_TOP: [number, number, number] = [170, 190, 198];
const SKY_DAY_BOTTOM: [number, number, number] = [214, 222, 216];
const SKY_NIGHT_TOP: [number, number, number] = [22, 30, 56];
const SKY_NIGHT_BOTTOM: [number, number, number] = [52, 62, 92];

const BUILDINGS = [
  { x: 0, w: 90, h: 180 },
  { x: 80, w: 70, h: 120 },
  { x: 150, w: 110, h: 220 },
  { x: 260, w: 80, h: 150 },
  { x: 340, w: 120, h: 200 },
  { x: 460, w: 70, h: 110 },
  { x: 530, w: 100, h: 190 },
  { x: 630, w: 90, h: 140 },
];

/** The scenery seen through the glass. Drawn first so rain falls in front of it. */
export function createWindowView(): Entity {
  return {
    depth: 0.5,
    update() {},
    draw(g, f) {
      g.save();
      g.beginPath();
      g.rect(OPENING.x, OPENING.y, OPENING.w, OPENING.h);
      g.clip();
      g.translate(-f.parallax.x * MAX_PARALLAX * 0.3, -f.parallax.y * MAX_PARALLAX * 0.2);
      const sky = g.createLinearGradient(0, OPENING.y, 0, OPENING.y + OPENING.h);
      sky.addColorStop(0, mixColor(SKY_DAY_TOP, SKY_NIGHT_TOP, f.night));
      sky.addColorStop(1, mixColor(SKY_DAY_BOTTOM, SKY_NIGHT_BOTTOM, f.night));
      g.fillStyle = sky;
      g.fillRect(OPENING.x - 40, OPENING.y - 40, OPENING.w + 80, OPENING.h + 80);

      const base = OPENING.y + OPENING.h;
      for (const b of BUILDINGS) {
        const x = OPENING.x + b.x - 10;
        g.fillStyle = mixColor([150, 165, 172], [28, 34, 58], f.night);
        g.fillRect(x, base - b.h - 40, b.w, b.h + 40);
        drawLitWindows(g, x, base - b.h - 30, b.w, b.h, f.night, b.x);
      }
      g.fillStyle = mixColor([120, 135, 140], [18, 22, 40], f.night);
      g.fillRect(OPENING.x - 40, base - 46, OPENING.w + 80, 70);
      glow(g, OPENING.x + 560, base - 90, 90, "255,200,120", 0.35 * f.night);
      g.fillStyle = `rgba(60,70,80,${0.35 * (1 - f.night)})`;
      g.fillRect(OPENING.x - 40, base - 46, OPENING.w + 80, 6);
      g.restore();
    },
  };
}

function drawLitWindows(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  night: number,
  seed: number,
): void {
  if (night < 0.05) return;
  g.fillStyle = `rgba(255,214,140,${0.8 * night})`;
  for (let r = 0; r < Math.floor(h / 36); r++) {
    for (let c = 0; c < Math.floor(w / 28); c++) {
      if (((r * 7 + c * 13 + seed) % 5) < 2) g.fillRect(x + 8 + c * 28, y + 8 + r * 36, 10, 14);
    }
  }
}

/** Window frame, sashes, glass sheen and sill. The lower sash slides with the window state. */
export function createSash(): Entity {
  return {
    depth: 0.5,
    update() {},
    draw(g, f) {
      drawFrameRails(g);
      const lower = lowerSash(f.windowOpen);
      drawSashPane(g, lower, f);
      g.strokeStyle = "#cfa97a";
      g.lineWidth = 14;
      g.strokeRect(lower.x - 7, lower.y - 4, lower.w + 14, lower.h + 8);
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(OPENING.x + OPENING.w / 2, lower.y);
      g.lineTo(OPENING.x + OPENING.w / 2, lower.y + lower.h);
      g.stroke();
      g.fillStyle = "#e8d3ad";
      rrect(g, OPENING.x + OPENING.w / 2 - 36, lower.y + 10, 72, 10, 4);
      g.fill();
      drawSill(g);
    },
  };
}

function drawFrameRails(g: CanvasRenderingContext2D): void {
  const x = OPENING.x - FRAME_PAD;
  const y = OPENING.y - FRAME_PAD;
  const w = OPENING.w + FRAME_PAD * 2;
  const h = OPENING.h + FRAME_PAD * 2;
  g.fillStyle = "#b98a5e";
  g.fillRect(x, y, w, FRAME_PAD);
  g.fillRect(x, y, FRAME_PAD, h);
  g.fillRect(x + w - FRAME_PAD, y, FRAME_PAD, h);
  g.fillRect(x, y + h - FRAME_PAD, w, FRAME_PAD);
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(x, y + FRAME_PAD, w, 6);
  g.strokeStyle = "#cfa97a";
  g.lineWidth = 7;
  g.strokeRect(UPPER_SASH.x - 3, UPPER_SASH.y - 3, UPPER_SASH.w + 6, UPPER_SASH.h + 6);
  g.beginPath();
  g.moveTo(OPENING.x + OPENING.w / 2, UPPER_SASH.y);
  g.lineTo(OPENING.x + OPENING.w / 2, UPPER_SASH.y + UPPER_SASH.h);
  g.stroke();
}

function drawSashPane(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, f: Frame): void {
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.fillStyle = `rgba(255,255,255,${0.04 + 0.04 * (1 - f.night)})`;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = "rgba(255,255,255,0.07)";
  g.beginPath();
  g.moveTo(r.x + 60, r.y);
  g.lineTo(r.x + 160, r.y);
  g.lineTo(r.x + 60, r.y + r.h);
  g.lineTo(r.x - 40, r.y + r.h);
  g.closePath();
  g.fill();
  g.restore();
}

function drawSill(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#c79a68";
  rrect(g, OPENING.x - FRAME_PAD - 20, SILL_Y, OPENING.w + FRAME_PAD * 2 + 40, 22, 5);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(OPENING.x - FRAME_PAD - 16, SILL_Y + 1, OPENING.w + FRAME_PAD * 2 + 32, 4);
}
