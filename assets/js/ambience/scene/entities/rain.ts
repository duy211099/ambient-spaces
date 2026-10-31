import type { LayerId } from "../../core/types";
import type { Entity } from "../entity";
import { lowerSash, OPENING, UPPER_SASH } from "./geometry";
import { clamp, mulberry } from "./common";

const MAX_DROPS = 220;
const MAX_STREAKS = 14;
const WIND = -34;

interface Drop {
  x: number;
  y: number;
  seed: number;
}

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
  bead: number;
  age: number;
}

/** Drops outside, streaks and fog on the glass. At level 0 nothing is drawn. */
export function createRain(layer: LayerId | null): Entity {
  const rng = mulberry(7);
  const bottom = OPENING.y + OPENING.h;
  const drops: Drop[] = Array.from({ length: MAX_DROPS }, () => ({
    x: OPENING.x + rng() * (OPENING.w + 80),
    y: bottom + 30,
    seed: rng(),
  }));
  const spawnStreak = (): Streak => ({
    x: OPENING.x + 20 + rng() * (OPENING.w - 40),
    y: OPENING.y + rng() * 250,
    len: 24 + rng() * 40,
    speed: 10 + rng() * 26,
    bead: 2.5 + rng() * 2,
    age: 0,
  });
  const streaks: Streak[] = Array.from({ length: MAX_STREAKS }, () => ({ ...spawnStreak(), y: bottom + 200 }));
  let lvl = 0;
  let dropCount = 0;
  let streakCount = 0;

  return {
    depth: 0.5,
    update(f) {
      lvl = layer === null ? 0 : f.level(layer);
      dropCount = Math.round(lvl * MAX_DROPS * f.particleScale);
      streakCount = Math.round(lvl * MAX_STREAKS * f.particleScale);
      const speed = 380 + lvl * 220;
      drops.forEach((d, i) => {
        if (d.y > bottom + 20) {
          if (i >= dropCount) return;
          d.y = OPENING.y - 30 - d.seed * 500;
          d.x = OPENING.x + rng() * (OPENING.w + 80);
        }
        d.y += speed * (0.8 + d.seed * 0.4) * f.dt;
        d.x += WIND * f.dt;
      });
      streaks.forEach((s, i) => {
        s.y += s.speed * f.dt;
        s.age += f.dt;
        if (s.y - s.len > bottom) {
          if (i >= streakCount) return;
          Object.assign(s, spawnStreak());
        }
      });
    },
    draw(g, f) {
      if (lvl <= 0 && dropCount === 0) return;
      const visible = clamp(lvl * 10);
      g.save();
      g.beginPath();
      g.rect(OPENING.x, OPENING.y, OPENING.w, OPENING.h);
      g.clip();

      const len = 8 + lvl * 22;
      g.strokeStyle = `rgba(215,228,238,${(0.25 + 0.35 * lvl) * visible})`;
      g.lineWidth = 1.4 + lvl;
      g.lineCap = "round";
      g.beginPath();
      drops.forEach((d, i) => {
        if (i >= dropCount && d.y > bottom + 20) return;
        g.moveTo(d.x, d.y);
        g.lineTo(d.x + (WIND / 380) * len, d.y - len * (0.7 + d.seed * 0.5));
      });
      g.stroke();
      g.restore();

      drawGlass(g, f.windowOpen, lvl, visible, streaks, streakCount);
    },
  };
}

function drawGlass(
  g: CanvasRenderingContext2D,
  open: number,
  lvl: number,
  visible: number,
  streaks: Streak[],
  streakCount: number,
): void {
  const lower = lowerSash(open);
  g.save();
  g.beginPath();
  g.rect(UPPER_SASH.x, UPPER_SASH.y, UPPER_SASH.w, UPPER_SASH.h);
  g.rect(lower.x, lower.y, lower.w, lower.h);
  g.clip();

  const fog = g.createLinearGradient(0, OPENING.y, 0, OPENING.y + OPENING.h);
  fog.addColorStop(0, `rgba(226,234,236,${lvl * 0.22})`);
  fog.addColorStop(1, `rgba(236,240,238,${lvl * 0.4})`);
  g.fillStyle = fog;
  g.fillRect(OPENING.x, OPENING.y, OPENING.w, OPENING.h);

  g.lineCap = "round";
  streaks.forEach((s, i) => {
    if (i >= streakCount && s.y - s.len > OPENING.y + OPENING.h) return;
    const a = 0.5 * visible * clamp(s.age / 1.2);
    const grad = g.createLinearGradient(0, s.y - s.len, 0, s.y);
    grad.addColorStop(0, "rgba(235,242,246,0)");
    grad.addColorStop(1, `rgba(235,242,246,${a})`);
    g.strokeStyle = grad;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(s.x, s.y - s.len);
    g.lineTo(s.x, s.y);
    g.stroke();
    g.fillStyle = `rgba(245,250,252,${a + 0.1 * visible})`;
    g.beginPath();
    g.ellipse(s.x, s.y, s.bead * 0.8, s.bead * 1.2, 0, 0, Math.PI * 2);
    g.fill();
  });
  g.restore();
}
