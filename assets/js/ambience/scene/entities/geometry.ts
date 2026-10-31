import type { Rect } from "../../core/types";

export const FLOOR_Y = 620;

/** Glass opening of the window. */
export const OPENING: Rect = { x: 190, y: 110, w: 660, h: 410 };
export const FRAME_PAD = 24;
export const SILL_Y = OPENING.y + OPENING.h + FRAME_PAD;
export const SASH_TRAVEL = 190;

export const UPPER_SASH: Rect = { x: OPENING.x, y: OPENING.y, w: OPENING.w, h: 200 };

/** The lower sash slides up by `open * SASH_TRAVEL`. */
export function lowerSash(open: number): Rect {
  return { x: OPENING.x, y: OPENING.y + 203 - open * SASH_TRAVEL, w: OPENING.w, h: 207 };
}

export const MAX_PARALLAX = 16;
