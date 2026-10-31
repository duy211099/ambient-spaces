import type { Entity } from "../entity";
import { glow } from "./common";

const LAMPS = [
  { x: 640, drop: 230 },
  { x: 1130, drop: 190 },
  { x: 1335, drop: 160 },
];

/** Pendant lamps. Brighter at night, with a soft flicker unless motion is reduced. */
export function createLamps(): Entity {
  let t = 0;
  return {
    depth: 0.9,
    update(f) {
      t += f.dt;
    },
    draw(g, f) {
      LAMPS.forEach((l, i) => {
        const flicker = f.reduced
          ? 0
          : Math.sin(t * 3.1 + i * 2) * Math.sin(t * 5.7 + i) * 0.05 + (Math.sin(t * 0.37 + i * 5) > 0.97 ? -0.08 : 0);
        const lit = (0.35 + 0.65 * f.night) * (1 + flicker);
        g.strokeStyle = "#3b2a21";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(l.x, 40);
        g.lineTo(l.x, l.drop);
        g.stroke();

        g.save();
        g.globalCompositeOperation = "lighter";
        glow(g, l.x, l.drop + 30, 190, "255,190,110", 0.3 * lit);
        g.restore();

        g.fillStyle = "#4a3a30";
        g.beginPath();
        g.moveTo(l.x - 14, l.drop);
        g.lineTo(l.x + 14, l.drop);
        g.lineTo(l.x + 42, l.drop + 34);
        g.lineTo(l.x - 42, l.drop + 34);
        g.closePath();
        g.fill();
        g.fillStyle = `rgba(255,214,150,${0.45 + 0.55 * Math.min(1, lit)})`;
        g.beginPath();
        g.ellipse(l.x, l.drop + 34, 42, 7, 0, 0, Math.PI * 2);
        g.fill();
      });
    },
  };
}
