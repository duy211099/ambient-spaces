export type LayerId = string & { readonly __brand: "LayerId" };

export function layerId(raw: string): LayerId {
  return raw as LayerId;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ProceduralKind = "rain" | "murmur" | "hiss" | "pads";

export type EntityKind =
  | "room"
  | "window"
  | "rain"
  | "sash"
  | "cat"
  | "cup"
  | "customers"
  | "barista"
  | "speaker"
  | "tint"
  | "lamps";

export interface LayerConfig {
  id: LayerId;
  label: string;
  audio: {
    /** URL of an optional loop. null means "always use the procedural fallback". */
    src: string | null;
    fallback: ProceduralKind;
    /** Outdoor layers pass through the window low-pass filter. */
    outdoor: boolean;
  };
  entity: EntityKind;
  /** Click target in scene coordinates. */
  hit: Rect;
  defaultVolume: number;
}

export interface SceneConfig {
  id: string;
  title: string;
  /** Logical scene coordinates. */
  size: { w: number; h: number };
  layers: LayerConfig[];
  /** Low-pass cutoff in Hz applied to outdoor layers while the window is closed. */
  windowFilterHz: number;
  /** Everything the scene draws, back to front. Layer entities must be listed too. */
  entities: EntityKind[];
}

export interface MixState {
  version: 1;
  master: number;
  windowOpen: boolean;
  layers: Record<LayerId, number>;
}
