import type { SceneConfig } from "../core/types";
import { cafeRain } from "./cafe-rain/config";

const ALL: SceneConfig[] = [cafeRain];

export const SCENES: Record<string, SceneConfig> = Object.fromEntries(ALL.map((s) => [s.id, s]));
