import type { EntityKind, LayerId } from "../core/types";

export interface Vec {
  x: number;
  y: number;
}

/** Everything an entity may read for one frame. Entities only see smoothed values. */
export interface Frame {
  t: number;
  dt: number;
  /** Smoothed 0..1 level of a layer; this is the value that also drives its gain. */
  level(id: LayerId): number;
  /** Smoothed 0 (closed) .. 1 (open). */
  windowOpen: number;
  /** 0 = full daylight, 1 = night. */
  night: number;
  reduced: boolean;
  /** 1, or 0.5 under reduced motion. */
  particleScale: number;
  /** -1..1, already zero under reduced motion. */
  parallax: Vec;
}

export interface Entity {
  /** Parallax multiplier: 0 stays put, 1 moves the most. */
  depth: number;
  update(f: Frame): void;
  draw(g: CanvasRenderingContext2D, f: Frame): void;
}

/** layer is the bound LayerId for layer entities, null for idle-life entities. */
export type EntityFactory = (layer: LayerId | null) => Entity;

export type EntityRegistry = Record<EntityKind, EntityFactory>;
