import type { Entity } from "../entity";
import { SILL_Y } from "./geometry";
import { rrect } from "./common";

const X = 560;

/** A cup on the sill with a lazy wisp of steam. Idle life, always present. */
export function createCup(): Entity {
  let t = 0;
  return {
    depth: 0.8,
    update(f) {
      t += f.dt;
    },
    draw(g) {
      g.fillStyle = "#f1e6d2";
      rrect(g, X - 20, SILL_Y - 30, 40, 30, 8);
      g.fill();
      g.strokeStyle = "#f1e6d2";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(X + 22, SILL_Y - 18, 9, -Math.PI / 2, Math.PI / 2);
      g.stroke();
      g.fillStyle = "#5b3a29";
      g.beginPath();
      g.ellipse(X, SILL_Y - 29, 17, 4, 0, 0, Math.PI * 2);
      g.fill();

      g.lineCap = "round";
      g.lineWidth = 3;
      for (let w = 0; w < 3; w++) {
        const phase = t * 0.9 + w * 2.1;
        for (let j = 0; j < 14; j++) {
          const p = j / 14;
          const x = X + (w - 1) * 9 + Math.sin(phase + j * 0.55) * (3 + j * 0.5);
          const y = SILL_Y - 36 - j * 5.5;
          const a = 0.32 * (1 - p) * Math.min(1, j / 2);
          g.strokeStyle = `rgba(255,255,255,${a})`;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + Math.sin(phase + (j + 1) * 0.55) * 0.5, y - 5.5);
          g.stroke();
        }
      }
    },
  };
}
