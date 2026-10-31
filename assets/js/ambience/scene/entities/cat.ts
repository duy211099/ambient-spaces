import type { Entity } from "../entity";
import { SILL_Y } from "./geometry";
import { mulberry } from "./common";

const X = 330;
const STRETCH_SECONDS = 3.2;

export function createCat(): Entity {
  const rng = mulberry(11);
  let blinkIn = 2 + rng() * 3;
  let blinkLeft = 0;
  let stretchIn = 14 + rng() * 10;
  let stretchT = -1;
  let tail = 0;

  return {
    depth: 0.8,
    update(f) {
      tail += f.dt;
      blinkIn -= f.dt;
      if (blinkIn <= 0) {
        blinkLeft = 0.18;
        blinkIn = 2.5 + rng() * 4.5;
      }
      blinkLeft = Math.max(0, blinkLeft - f.dt);
      stretchIn -= f.dt;
      if (stretchT < 0 && stretchIn <= 0) {
        stretchT = 0;
        stretchIn = 28 + rng() * 22;
      }
      if (stretchT >= 0) {
        stretchT += f.dt;
        if (stretchT > STRETCH_SECONDS) stretchT = -1;
      }
    },
    draw(g) {
      const s = stretchT < 0 ? 0 : Math.sin((stretchT / STRETCH_SECONDS) * Math.PI);
      const breathe = Math.sin(tail * 1.7) * 1.2;
      g.save();
      g.translate(X, SILL_Y);
      g.scale(1 + 0.3 * s, 1 - 0.1 * s + breathe * 0.004);

      const fur = "#8a7260";
      const dark = "#6c5646";
      const sway = Math.sin(tail * 1.1) * 14;
      g.strokeStyle = dark;
      g.lineWidth = 11;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-26, -8);
      g.bezierCurveTo(-58, -4, -52, 10 + sway * 0.2, -14 + sway, 4);
      g.stroke();
      g.fillStyle = fur;
      g.beginPath();
      g.moveTo(-34, 0);
      g.bezierCurveTo(-40, -52, -6, -66, 14, -60);
      g.bezierCurveTo(40, -52, 38, -4, 34, 0);
      g.closePath();
      g.fill();
      g.fillStyle = "#a89280";
      g.beginPath();
      g.ellipse(18, -20, 12, 22, 0.1, 0, Math.PI * 2);
      g.fill();

      const hx = 20 + 14 * s;
      const hy = -76 + 14 * s + breathe * 0.5;
      g.fillStyle = fur;
      g.beginPath();
      g.moveTo(hx - 17, hy - 12);
      g.lineTo(hx - 12, hy - 36);
      g.lineTo(hx - 2, hy - 18);
      g.moveTo(hx + 17, hy - 12);
      g.lineTo(hx + 12, hy - 36);
      g.lineTo(hx + 2, hy - 18);
      g.fill();
      g.beginPath();
      g.ellipse(hx, hy, 22, 18, 0, 0, Math.PI * 2);
      g.fill();

      g.lineWidth = 2.2;
      g.strokeStyle = "#2e2118";
      g.fillStyle = "#c7d98a";
      for (const ex of [hx - 8, hx + 8]) {
        if (blinkLeft > 0 || s > 0.4) {
          g.beginPath();
          g.moveTo(ex - 4, hy - 2);
          g.quadraticCurveTo(ex, hy + 2, ex + 4, hy - 2);
          g.stroke();
        } else {
          g.beginPath();
          g.ellipse(ex, hy - 2, 4, 4.5, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#2e2118";
          g.fillRect(ex - 0.9, hy - 6, 1.8, 8);
          g.fillStyle = "#c7d98a";
        }
      }
      g.fillStyle = "#d99a94";
      g.beginPath();
      g.moveTo(hx - 3, hy + 4);
      g.lineTo(hx + 3, hy + 4);
      g.lineTo(hx, hy + 8);
      g.fill();
      g.restore();
    },
  };
}
