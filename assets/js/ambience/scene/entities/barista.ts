import type { LayerId } from "../../core/types";
import type { Entity } from "../entity";
import { clamp, Emitter, glow, rrect } from "./common";
import { FLOOR_Y } from "./geometry";
import { drawPerson, REST, type Look } from "./person";

const COUNTER_TOP = 492;
const BARISTA_X = 1235;
const BARISTA_Y = 524;
const MACHINE_X = 1300;
const NOZZLE = { x: MACHINE_X + 24, y: COUNTER_TOP - 52 };

const LOOK: Look = { skin: "#e3b48c", hair: "#4a2f22", shirt: "#e8dcc4", pants: "#3e4b5c", longHair: false };

/** Barista, counter, and espresso machine. Presence, steam and the machine light follow the layer level. */
export function createBarista(layer: LayerId | null): Entity {
  const steam = new Emitter(40);
  let t = 0;
  let lvl = 0;
  let seed = 5;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  return {
    depth: 0.9,
    update(f) {
      t += f.dt;
      lvl = layer === null ? 0 : f.level(layer);
      steam.update(f.dt, lvl * 2.2 * f.particleScale, () => ({
        x: NOZZLE.x + (rand() - 0.5) * 6,
        y: NOZZLE.y,
        vx: (rand() - 0.3) * 8,
        vy: -(26 + rand() * 18),
        age: 0,
        life: 2 + rand() * 1.2,
        size: 8 + rand() * 6,
        phase: rand() * 6.28,
      }));
    },
    draw(g) {
      drawBackShelf(g);
      const presence = clamp(lvl * 3);
      const work = Math.sin(t * 1.9);
      drawPerson(g, LOOK, {
        x: BARISTA_X,
        y: BARISTA_Y,
        scale: 1,
        alpha: presence,
        facing: 1,
        legs: 0,
        step: 0,
        blink: (t * 0.8) % 4.3 < 0.12,
        speaking: false,
        apron: "#6b4a3a",
        pose: {
          ...REST,
          rx: 62 + 10 * Math.max(0, work),
          ry: -4 - 14 * Math.max(0, work),
          lx: 40,
          ly: 6 + 3 * Math.sin(t * 1.9 + 1),
          hx: 4 + work * 1.5,
          hy: 0,
          tilt: 0.04 * work,
        },
      });
      drawCounter(g);
      drawMachine(g, lvl, t);
      for (const p of steam.items) {
        const k = p.age / p.life;
        const r = p.size * (1 + k * 2.2);
        glow(g, p.x + Math.sin(p.age * 2 + p.phase) * 6, p.y, r, "255,255,255", 0.38 * (1 - k) * clamp(lvl * 6));
      }
    },
  };
}

function drawBackShelf(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#6b4630";
  rrect(g, 1060, 330, 190, 12, 3);
  g.fill();
  const cols = ["#d9b25f", "#7ea6a0", "#c77d5a", "#e8dcc4", "#8b7fb0"];
  cols.forEach((c, i) => {
    g.fillStyle = c;
    rrect(g, 1076 + i * 34, 306, 22, 24, 5);
    g.fill();
  });
}

function drawCounter(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#6e452e";
  g.fillRect(1000, COUNTER_TOP, 600, FLOOR_Y - COUNTER_TOP);
  g.fillStyle = "#8a5a3b";
  g.fillRect(1000, COUNTER_TOP + 14, 600, FLOOR_Y - COUNTER_TOP - 14);
  g.strokeStyle = "rgba(40,20,10,0.25)";
  g.lineWidth = 3;
  for (let x = 1020; x < 1590; x += 110) g.strokeRect(x, COUNTER_TOP + 30, 90, 100);
  g.fillStyle = "#c79a68";
  rrect(g, 990, COUNTER_TOP - 8, 620, 22, 5);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.18)";
  g.fillRect(996, COUNTER_TOP - 6, 608, 4);

  g.fillStyle = "rgba(220,235,235,0.35)";
  rrect(g, 1030, COUNTER_TOP - 52, 120, 44, 8);
  g.fill();
  g.fillStyle = "#e8c991";
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.ellipse(1056 + i * 34, COUNTER_TOP - 18, 14, 9, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function drawMachine(g: CanvasRenderingContext2D, lvl: number, t: number): void {
  const x = MACHINE_X;
  const top = COUNTER_TOP - 98;
  g.fillStyle = "#b9b2a8";
  rrect(g, x - 20, top, 130, 92, 10);
  g.fill();
  g.fillStyle = "#8c867d";
  rrect(g, x - 20, top, 130, 20, 10);
  g.fill();
  g.fillStyle = "#d4cec4";
  g.fillRect(x - 12, top + 26, 8, 56);
  g.fillStyle = "#4a4540";
  rrect(g, x + 8, top + 62, 30, 10, 4);
  g.fill();
  g.fillRect(x + 20, top + 40, 6, 24);
  g.fillStyle = "#f1e6d2";
  rrect(g, x + 14, COUNTER_TOP - 24, 20, 18, 4);
  g.fill();

  const ledX = x + 92;
  const ledY = top + 40;
  g.fillStyle = `rgb(${Math.round(70 + 185 * lvl)},${Math.round(60 + 120 * lvl)},${Math.round(55 + 30 * lvl)})`;
  g.beginPath();
  g.arc(ledX, ledY, 6, 0, Math.PI * 2);
  g.fill();
  if (lvl > 0.002) {
    g.save();
    g.globalCompositeOperation = "lighter";
    glow(g, ledX, ledY, 46, "255,170,90", lvl * 0.7 * (0.92 + 0.08 * Math.sin(t * 3)));
    g.restore();
  }
}
