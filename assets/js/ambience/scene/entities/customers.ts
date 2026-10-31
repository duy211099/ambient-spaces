import type { LayerId } from "../../core/types";
import type { Entity, Frame } from "../entity";
import { clamp, lerp, mulberry, rrect, smoothstep } from "./common";
import { FLOOR_Y } from "./geometry";
import { blendPose, drawPerson, REST, type Look, type Pose } from "./person";

type Activity = "sip" | "chat" | "phone";
const ACTIVITIES: Activity[] = ["sip", "chat", "phone"];

/** Seat state machine: empty -> entering -> seated -> leaving -> empty. */
type SeatState =
  | { kind: "empty" }
  | { kind: "entering"; t: number }
  | { kind: "seated"; time: number; activity: Activity; left: number; blend: number; from: Pose }
  | { kind: "leaving"; t: number };

interface Seat {
  x: number;
  table: number;
  facing: 1 | -1;
  look: Look;
  phase: number;
  state: SeatState;
  pose: Pose;
}

const TABLES = [330, 640, 950, 1260];
const SEAT_DX = 66;
const SEAT_Y = 748;
const WALK_Y = 690;
const DOOR_X = 120;
const DOOR_Y = FLOOR_Y - 2;
const SETTLE_AT = 0.88;
const WALK_SECONDS = 3.4;
const FADE_SECONDS = 0.7;
const STEP_COOLDOWN = 0.8;
const MAX_SEATED = 8;
const FILL_ORDER = [0, 3, 5, 1, 6, 2, 7, 4];

const SKIN = ["#f1c7a0", "#d9a073", "#a56d49", "#f4d2b0", "#7d4f35"];
const HAIR = ["#3b2a21", "#7a4a2a", "#1f1a1a", "#b8863f", "#5b5b63", "#8c3b2e"];
const SHIRT = ["#7ea6a0", "#c77d5a", "#d9b25f", "#8b7fb0", "#b5657a", "#6e8f5f", "#5d7fa8", "#c9a28a"];
const PANTS = ["#4a4358", "#3e4b5c", "#5a4a3c", "#34434a"];

function makeSeats(): Seat[] {
  const rng = mulberry(42);
  const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)];
  return TABLES.flatMap((tx, table) =>
    [-1, 1].map((side) => ({
      x: tx + side * SEAT_DX,
      table,
      facing: (side < 0 ? 1 : -1) as 1 | -1,
      look: { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick(PANTS), longHair: rng() > 0.55 },
      phase: rng() * 10,
      state: { kind: "empty" } as SeatState,
      pose: REST,
    })),
  );
}

function targetPose(a: Activity, t: number, phase: number): Pose {
  switch (a) {
    case "sip": {
      const p = ((t + phase) % 7) / 7;
      const u = p > 0.55 && p < 0.85 ? Math.pow(Math.sin(((p - 0.55) / 0.3) * Math.PI), 0.7) : 0;
      return { ...REST, rx: lerp(30, 12, u), ry: lerp(34, -74, u), tilt: -0.1 * u };
    }
    case "chat":
      return {
        rx: 30 + 8 * Math.sin(t * 5 + phase),
        ry: 12 + 16 * Math.max(0, Math.sin(t * 6.9 + phase)),
        lx: -30,
        ly: 34,
        hx: Math.sin(t * 2 + phase) * 1.5,
        hy: 0,
        tilt: 0.05 * Math.sin(t * 8 + phase),
      };
    case "phone":
      return { rx: 16, ry: -26, lx: 4, ly: -22, hx: 3, hy: 5, tilt: 0.18 };
  }
}

function walkPlacement(seat: Seat, u: number): { x: number; y: number; scale: number; legs: number; step: number } {
  if (u < SETTLE_AT) {
    const w = u / SETTLE_AT;
    return { x: lerp(DOOR_X, seat.x, w), y: lerp(DOOR_Y, WALK_Y, w), scale: lerp(0.9, 1, w), legs: 1, step: w * 26 };
  }
  const s = smoothstep(0, 1, (u - SETTLE_AT) / (1 - SETTLE_AT));
  return { x: seat.x, y: lerp(WALK_Y, SEAT_Y, s), scale: 1, legs: 1 - s, step: 26 };
}

export function createCustomers(layer: LayerId | null): Entity {
  const seats = makeSeats();
  let cooldown = 0;
  let clock = 0;
  const order = FILL_ORDER.map((i) => seats[i]);

  const occupied = (): number => seats.filter((s) => s.state.kind === "entering" || s.state.kind === "seated").length;

  function rebalance(target: number): void {
    const n = occupied();
    if (n < target) {
      const seat = order.find((s) => s.state.kind === "empty");
      if (seat) seat.state = { kind: "entering", t: 0 };
    } else if (n > target) {
      const seat = [...order].reverse().find((s) => s.state.kind === "seated" || s.state.kind === "entering");
      if (seat) seat.state = { kind: "leaving", t: seat.state.kind === "entering" ? 1 - seat.state.t : 0 };
    }
    cooldown = target === 0 ? STEP_COOLDOWN * 0.4 : STEP_COOLDOWN;
  }

  function advance(seat: Seat, f: Frame): void {
    const s = seat.state;
    const dur = f.reduced ? FADE_SECONDS : WALK_SECONDS;
    switch (s.kind) {
      case "empty":
        break;
      case "entering":
        s.t += f.dt / dur;
        if (s.t >= 1) {
          seat.state = {
            kind: "seated",
            time: 0,
            activity: ACTIVITIES[Math.floor(seat.phase) % 3],
            left: 8 + (seat.phase % 1) * 8,
            blend: 1,
            from: REST,
          };
        }
        break;
      case "seated":
        s.time += f.dt;
        s.left -= f.dt;
        s.blend = Math.min(1, s.blend + f.dt / 0.7);
        if (s.left <= 0) {
          s.from = seat.pose;
          s.blend = 0;
          s.activity = ACTIVITIES[(ACTIVITIES.indexOf(s.activity) + 1 + Math.floor(seat.phase * 7 + s.time) % 2) % 3];
          s.left = 9 + ((seat.phase * 13 + s.time) % 7);
        }
        seat.pose = blendPose(s.from, targetPose(s.activity, clock, seat.phase), smoothstep(0, 1, s.blend));
        break;
      case "leaving":
        s.t += f.dt / dur;
        if (s.t >= 1) seat.state = { kind: "empty" };
        break;
    }
  }

  return {
    depth: 0.9,
    update(f) {
      clock += f.dt;
      const lvl = layer === null ? 0 : f.level(layer);
      cooldown -= f.dt;
      if (cooldown <= 0) rebalance(Math.round(lvl * MAX_SEATED));
      for (const seat of seats) advance(seat, f);
    },
    draw(g, f) {
      for (const seat of seats) drawChair(g, seat);
      for (const seat of seats) drawSeat(g, seat, f, clock);
      TABLES.forEach((tx, i) => drawTable(g, tx, seats[i * 2], seats[i * 2 + 1]));
    },
  };
}

function drawChair(g: CanvasRenderingContext2D, seat: Seat): void {
  g.fillStyle = "#5e3c28";
  rrect(g, seat.x - 30 - seat.facing * 6, SEAT_Y - 84, 60, 96, 10);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.08)";
  rrect(g, seat.x - 24 - seat.facing * 6, SEAT_Y - 78, 48, 10, 5);
  g.fill();
}

function drawSeat(g: CanvasRenderingContext2D, seat: Seat, f: Frame, clock: number): void {
  const s = seat.state;
  if (s.kind === "empty") return;
  const blink = (clock * 0.9 + seat.phase * 7) % 4.1 < 0.12;
  const base = { facing: seat.facing, blink, speaking: false, pose: seat.pose };
  if (s.kind === "seated") {
    const speaking = s.activity === "chat" && (clock * 0.45 + seat.phase) % 2 < 1.2 && Math.sin(clock * 13) > 0;
    drawPerson(
      g,
      seat.look,
      { ...base, x: seat.x, y: SEAT_Y + Math.sin(clock * 1.6 + seat.phase) * 1.2, scale: 1, alpha: 1, legs: 0, step: 0, speaking },
      s.activity === "sip" ? mug : s.activity === "phone" ? phone : undefined,
    );
    if (speaking) drawSpeech(g, seat);
    return;
  }
  const u = s.kind === "entering" ? s.t : 1 - s.t;
  if (f.reduced) {
    const alpha = s.kind === "entering" ? s.t : 1 - s.t;
    drawPerson(g, seat.look, { ...base, x: seat.x, y: SEAT_Y, scale: 1, alpha, legs: 0, step: 0, pose: REST });
    return;
  }
  const w = walkPlacement(seat, u);
  const facing: 1 | -1 = s.kind === "entering" ? 1 : -1;
  const settling = u >= SETTLE_AT;
  drawPerson(g, seat.look, {
    ...base,
    ...w,
    facing: settling ? seat.facing : facing,
    alpha: clamp(u / 0.06),
    pose: REST,
  });
}

function mug(g: CanvasRenderingContext2D, hand: { x: number; y: number }): void {
  g.fillStyle = "#f1e6d2";
  rrect(g, hand.x - 8, hand.y - 12, 16, 15, 4);
  g.fill();
  g.fillStyle = "#5b3a29";
  g.fillRect(hand.x - 6, hand.y - 12, 12, 3);
}

function phone(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#26303a";
  rrect(g, 4, -42, 16, 26, 3);
  g.fill();
  g.fillStyle = "rgba(160,215,235,0.85)";
  rrect(g, 6, -40, 12, 22, 2);
  g.fill();
}

function drawSpeech(g: CanvasRenderingContext2D, seat: Seat): void {
  const bx = seat.x + seat.facing * 34;
  const by = SEAT_Y - 130;
  g.fillStyle = "rgba(255,250,240,0.8)";
  rrect(g, bx - 17, by - 11, 34, 22, 11);
  g.fill();
  g.fillStyle = "rgba(90,70,60,0.7)";
  for (const dx of [-8, 0, 8]) {
    g.beginPath();
    g.arc(bx + dx, by, 2.4, 0, Math.PI * 2);
    g.fill();
  }
}

function drawTable(g: CanvasRenderingContext2D, tx: number, a: Seat, b: Seat): void {
  g.fillStyle = "#4f3322";
  g.fillRect(tx - 8, 810, 16, 76);
  g.beginPath();
  g.ellipse(tx, 888, 54, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#8d5b38";
  g.beginPath();
  g.ellipse(tx, 812, 92, 20, 0, 0, Math.PI);
  g.fill();
  g.fillRect(tx - 92, 806, 184, 6);
  g.fillStyle = "#b98558";
  g.beginPath();
  g.ellipse(tx, 806, 92, 19, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.12)";
  g.beginPath();
  g.ellipse(tx - 20, 801, 52, 8, 0, 0, Math.PI * 2);
  g.fill();

  for (const seat of [a, b]) {
    const s = seat.state;
    if (s.kind !== "seated" || s.activity === "sip") continue;
    const cx = seat.x + (seat.x < tx ? 22 : -22);
    g.fillStyle = "#f1e6d2";
    rrect(g, cx - 9, 790, 18, 16, 4);
    g.fill();
    g.fillStyle = "#5b3a29";
    g.fillRect(cx - 7, 790, 14, 3);
  }
}
