import { rrect } from "./common";

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  longHair: boolean;
}

export interface Pose {
  /** Hand targets relative to the hip. */
  rx: number;
  ry: number;
  lx: number;
  ly: number;
  /** Head offset and tilt. */
  hx: number;
  hy: number;
  tilt: number;
}

export interface PersonState {
  x: number;
  /** Hip position. */
  y: number;
  scale: number;
  alpha: number;
  facing: 1 | -1;
  /** 0 = seated (no visible legs), 1 = standing. */
  legs: number;
  /** Walk cycle phase in radians; ignored when legs is 0. */
  step: number;
  pose: Pose;
  blink: boolean;
  speaking: boolean;
  apron?: string;
}

export const REST: Pose = { rx: 30, ry: 34, lx: -30, ly: 34, hx: 0, hy: 0, tilt: 0 };

export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const m = (p: number, q: number): number => p + (q - p) * t;
  return {
    rx: m(a.rx, b.rx),
    ry: m(a.ry, b.ry),
    lx: m(a.lx, b.lx),
    ly: m(a.ly, b.ly),
    hx: m(a.hx, b.hx),
    hy: m(a.hy, b.hy),
    tilt: m(a.tilt, b.tilt),
  };
}

const SHOULDER_Y = -62;

function arm(g: CanvasRenderingContext2D, sx: number, sy: number, hx: number, hy: number, shirt: string, skin: string): void {
  const d = Math.min(Math.hypot(hx - sx, hy - sy), 92);
  const bend = Math.sqrt(Math.max(0, 46 * 46 - (d / 2) * (d / 2)));
  const side = sx < 0 ? -1 : 1;
  const mx = (sx + hx) / 2 + side * bend * 0.6;
  const my = (sy + hy) / 2 + bend * 0.8;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = shirt;
  g.lineWidth = 13;
  g.beginPath();
  g.moveTo(sx, sy);
  g.quadraticCurveTo(mx, my, hx, hy);
  g.stroke();
  g.fillStyle = skin;
  g.beginPath();
  g.arc(hx, hy, 6, 0, Math.PI * 2);
  g.fill();
}

/** Draws a person at p.x, p.y (hip). Callers draw held items via the `held` callback after the arm. */
export function drawPerson(
  g: CanvasRenderingContext2D,
  look: Look,
  p: PersonState,
  held?: (g: CanvasRenderingContext2D, hand: { x: number; y: number }) => void,
): void {
  if (p.alpha <= 0.01) return;
  g.save();
  g.globalAlpha = p.alpha;
  g.translate(p.x, p.y);
  g.scale(p.scale * p.facing, p.scale);

  if (p.legs > 0.02) {
    const len = 92 * p.legs;
    for (const side of [-1, 1]) {
      const swing = Math.sin(p.step + (side > 0 ? 0 : Math.PI));
      const fx = side * 11 + swing * 13;
      const lift = Math.max(0, Math.cos(p.step + (side > 0 ? 0 : Math.PI))) * 6;
      g.strokeStyle = look.pants;
      g.lineWidth = 15;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(side * 9, 0);
      g.lineTo(fx, len - 6 - lift);
      g.stroke();
      g.fillStyle = "#3a2a24";
      g.beginPath();
      g.ellipse(fx + 3, len - lift, 11, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    g.fillStyle = look.pants;
    rrect(g, -26, -8, 52, 54, 10);
    g.fill();
  }

  g.fillStyle = look.shirt;
  rrect(g, -26, SHOULDER_Y - 6, 52, 76, 18);
  g.fill();
  if (p.apron) {
    g.fillStyle = p.apron;
    rrect(g, -19, SHOULDER_Y + 10, 38, 66, 8);
    g.fill();
  }

  arm(g, -22, SHOULDER_Y + 4, p.pose.lx, p.pose.ly, look.shirt, look.skin);
  arm(g, 22, SHOULDER_Y + 4, p.pose.rx, p.pose.ry, look.shirt, look.skin);
  held?.(g, { x: p.pose.rx, y: p.pose.ry });

  g.save();
  g.translate(p.pose.hx, SHOULDER_Y - 30 + p.pose.hy);
  g.rotate(p.pose.tilt);
  g.fillStyle = look.skin;
  g.fillRect(-6, 12, 12, 14);
  if (look.longHair) {
    g.fillStyle = look.hair;
    rrect(g, -24, -20, 48, 62, 20);
    g.fill();
  }
  g.fillStyle = look.skin;
  g.beginPath();
  g.ellipse(0, 0, 20, 22, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = look.hair;
  g.beginPath();
  g.ellipse(-1, -9, 22, 16, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#3a2a24";
  g.fillStyle = "#3a2a24";
  g.lineWidth = 2;
  for (const ex of [4, 13]) {
    if (p.blink) {
      g.beginPath();
      g.moveTo(ex - 2.5, 0);
      g.lineTo(ex + 2.5, 0);
      g.stroke();
    } else {
      g.beginPath();
      g.arc(ex, 0, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = "#a8554a";
  g.lineWidth = 2;
  g.beginPath();
  if (p.speaking) g.ellipse(9, 10, 3, 2.2, 0, 0, Math.PI * 2);
  else {
    g.moveTo(5, 10);
    g.quadraticCurveTo(9, 12, 13, 10);
  }
  g.stroke();
  g.restore();
  g.restore();
}
