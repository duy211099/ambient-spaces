import { layerId, type SceneConfig } from "../../core/types";

/**
 * Cafe by a rainy window.
 *
 * To use a real recording for a layer, drop a CC0 loop at
 * priv/static/audio/cafe-rain/<name>.ogg, set `src` to "/audio/cafe-rain/<name>.ogg",
 * and record its source and license in CREDITS.md. While `src` is null no network
 * request is made and the procedural fallback plays.
 */
export const cafeRain: SceneConfig = {
  id: "cafe-rain",
  title: "Cafe by a rainy window",
  size: { w: 1600, h: 900 },
  windowFilterHz: 1000,
  layers: [
    {
      id: layerId("rain"),
      label: "Rain",
      audio: { src: null, fallback: "rain", outdoor: true },
      entity: "rain",
      hit: { x: 166, y: 86, w: 708, h: 458 },
      defaultVolume: 0.5,
    },
    {
      id: layerId("crowd"),
      label: "Crowd chatter",
      audio: { src: null, fallback: "murmur", outdoor: false },
      entity: "customers",
      hit: { x: 230, y: 640, w: 1130, h: 250 },
      defaultVolume: 0.35,
    },
    {
      id: layerId("espresso"),
      label: "Espresso machine",
      audio: { src: null, fallback: "hiss", outdoor: false },
      entity: "barista",
      hit: { x: 1000, y: 340, w: 600, h: 286 },
      defaultVolume: 0.25,
    },
    {
      id: layerId("music"),
      label: "Cafe music",
      audio: { src: null, fallback: "pads", outdoor: false },
      entity: "speaker",
      hit: { x: 1320, y: 190, w: 240, h: 150 },
      defaultVolume: 0.3,
    },
  ],
  entities: ["room", "window", "rain", "sash", "cat", "cup", "customers", "barista", "speaker", "tint", "lamps"],
};
