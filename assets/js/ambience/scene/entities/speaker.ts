import type { LayerId } from "../../core/types";
import type { Entity } from "../entity";
import { Emitter, glow, rrect } from "./common";

const X = 1440;
const SHELF_Y = 290;

/** Corner radio on a shelf. Glow and music notes scale with the layer level. */
export function createSpeaker(layer: LayerId | null): Entity {
  const notes = new Emitter(24);
  let t = 0;
  let lvl = 0;
  let seed = 3;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  return {
    depth: 0.85,
    update(f) {
      t += f.dt;
      lvl = layer === null ? 0 : f.level(layer);
      notes.update(f.dt, lvl * 1.2 * f.particleScale, () => ({
        x: X + (rand() - 0.5) * 60,
        y: SHELF_Y - 80,
        vx: (rand() - 0.5) * 10,
        vy: -(18 + rand() * 10),
        age: 0,
        life: 4.2,
        size: 0.8 + rand() * 0.5,
        phase: rand() * 6.28,
      }));
    },
    draw(g) {
      g.fillStyle = "#6b4630";
      rrect(g, X - 110, SHELF_Y, 220, 14, 4);
      g.fill();
      g.fillStyle = "#523421";
      g.fillRect(X - 90, SHELF_Y + 14, 12, 26);
      g.fillRect(X + 78, SHELF_Y + 14, 12, 26);

      if (lvl > 0.002) {
        g.save();
        g.globalCompositeOperation = "lighter";
        glow(g, X, SHELF_Y - 40, 150, "255,185,100", lvl * 0.5 * (0.92 + 0.08 * Math.sin(t * 2.4)));
        g.restore();
      }

      g.fillStyle = "#8b5a3c";
      rrect(g, X - 62, SHELF_Y - 78, 124, 78, 12);
      g.fill();
      g.fillStyle = "#a8714b";
      rrect(g, X - 58, SHELF_Y - 74, 116, 14, 7);
      g.fill();
      g.fillStyle = "#3a2619";
      g.beginPath();
      g.arc(X - 24, SHELF_Y - 34, 24, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#6e4a33";
      g.lineWidth = 2;
      for (let r = 6; r < 24; r += 6) {
        g.beginPath();
        g.arc(X - 24, SHELF_Y - 34, r + Math.sin(t * 9) * lvl * 0.8, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = `rgb(${Math.round(70 + 170 * lvl)},${Math.round(52 + 120 * lvl)},${Math.round(40 + 40 * lvl)})`;
      rrect(g, X + 8, SHELF_Y - 56, 38, 14, 4);
      g.fill();
      g.fillStyle = "#d9b27a";
      g.beginPath();
      g.arc(X + 27, SHELF_Y - 26, 7, 0, Math.PI * 2);
      g.fill();
      g.fillRect(X + 10, SHELF_Y - 14, 34, 3);

      for (const n of notes.items) {
        const p = n.age / n.life;
        const a = Math.sin(Math.PI * p) * 0.8 * Math.min(1, lvl * 6);
        drawNote(g, n.x + Math.sin(n.age * 1.6 + n.phase) * 14, n.y, n.size, a);
      }
    },
  };
}

function drawNote(g: CanvasRenderingContext2D, x: number, y: number, s: number, a: number): void {
  g.fillStyle = `rgba(255,224,160,${a})`;
  g.strokeStyle = `rgba(255,224,160,${a})`;
  g.lineWidth = 2.4 * s;
  g.beginPath();
  g.ellipse(x, y, 7 * s, 5 * s, -0.4, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x + 6 * s, y - 1 * s);
  g.lineTo(x + 6 * s, y - 24 * s);
  g.quadraticCurveTo(x + 14 * s, y - 20 * s, x + 12 * s, y - 12 * s);
  g.stroke();
}
