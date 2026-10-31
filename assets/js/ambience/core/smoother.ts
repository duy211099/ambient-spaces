/**
 * Time constant shared by audio (AudioParam.setTargetAtTime) and visuals
 * (Smoother). About 1.5 s to settle, so sound and picture ease on one curve.
 */
export const TAU = 0.45;

const SNAP = 0.0005;

export class Smoother {
  value: number;
  target: number;

  constructor(initial: number) {
    this.value = initial;
    this.target = initial;
  }

  step(dt: number): number {
    const diff = this.target - this.value;
    if (Math.abs(diff) < SNAP) {
      this.value = this.target;
    } else {
      this.value += diff * (1 - Math.exp(-dt / TAU));
    }
    return this.value;
  }
}
