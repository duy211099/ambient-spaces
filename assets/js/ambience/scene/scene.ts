import { Smoother } from "../core/smoother";
import type { LayerId, MixState, SceneConfig } from "../core/types";
import type { Entity, EntityRegistry, Frame } from "./entity";

const WINDOW_KEY = "__window__" as LayerId;

/** Owns the smoothed values and the entity list for one scene. */
export class Scene {
  reduced = false;
  parallax = { x: 0, y: 0 };
  night: number;
  private t = 0;
  private readonly smoothers = new Map<LayerId, Smoother>();
  private readonly entities: Entity[];
  private readonly frame: Frame;

  constructor(
    readonly config: SceneConfig,
    registry: EntityRegistry,
    mix: MixState,
    night: number,
  ) {
    this.night = night;
    for (const l of config.layers) this.smoothers.set(l.id, new Smoother(mix.layers[l.id]));
    this.smoothers.set(WINDOW_KEY, new Smoother(mix.windowOpen ? 1 : 0));

    const bound = new Map(config.layers.map((l) => [l.entity, l.id]));
    for (const l of config.layers) {
      if (!config.entities.includes(l.entity)) throw new Error(`scene ${config.id}: layer ${l.id} entity ${l.entity} not in entities`);
    }
    this.entities = config.entities.map((kind) => registry[kind](bound.get(kind) ?? null));

    const self = this;
    this.frame = {
      t: 0,
      dt: 0,
      level: (id) => self.smoothers.get(id)?.value ?? 0,
      get windowOpen() {
        return self.smoothers.get(WINDOW_KEY)?.value ?? 0;
      },
      get night() {
        return self.night;
      },
      get reduced() {
        return self.reduced;
      },
      get particleScale() {
        return self.reduced ? 0.5 : 1;
      },
      get parallax() {
        return self.parallax;
      },
    };
  }

  /** Same targets the audio engine receives; both sides then ease with TAU. */
  setMix(mix: MixState): void {
    for (const l of this.config.layers) this.smoothers.get(l.id)!.target = mix.layers[l.id];
    this.smoothers.get(WINDOW_KEY)!.target = mix.windowOpen ? 1 : 0;
  }

  levels(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const l of this.config.layers) out[l.id] = this.smoothers.get(l.id)!.value;
    out.window = this.smoothers.get(WINDOW_KEY)!.value;
    return out;
  }

  update(dt: number): void {
    this.t += dt;
    for (const s of this.smoothers.values()) s.step(dt);
    this.frame.t = this.t;
    this.frame.dt = dt;
    for (const e of this.entities) e.update(this.frame);
  }

  draw(g: CanvasRenderingContext2D, maxShift: number): void {
    for (const e of this.entities) {
      g.save();
      g.translate(-this.parallax.x * e.depth * maxShift, -this.parallax.y * e.depth * maxShift * 0.6);
      e.draw(g, this.frame);
      g.restore();
    }
  }
}
