import type { Entity } from "../entity";

/** Time-of-day grade over the whole room: warm at dusk, deep blue at night. */
export function createTint(): Entity {
  return {
    depth: 0,
    update() {},
    draw(g, f) {
      g.fillStyle = `rgba(255,170,90,${0.05 + 0.08 * f.night})`;
      g.fillRect(-800, -800, 3200, 2600);
      g.fillStyle = `rgba(22,26,70,${0.4 * f.night})`;
      g.fillRect(-800, -800, 3200, 2600);
    },
  };
}
