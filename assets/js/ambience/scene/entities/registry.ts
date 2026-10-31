import type { EntityRegistry } from "../entity";
import { createBarista } from "./barista";
import { createCat } from "./cat";
import { createCup } from "./cup";
import { createCustomers } from "./customers";
import { createLamps } from "./lamps";
import { createRain } from "./rain";
import { createRoom } from "./room";
import { createSpeaker } from "./speaker";
import { createTint } from "./tint";
import { createSash, createWindowView } from "./window";

/** EntityKind -> factory. A scene config names kinds; nothing else knows the art. */
export const ENTITY_REGISTRY: EntityRegistry = {
  room: createRoom,
  window: createWindowView,
  rain: createRain,
  sash: createSash,
  cat: createCat,
  cup: createCup,
  customers: createCustomers,
  barista: createBarista,
  speaker: createSpeaker,
  tint: createTint,
  lamps: createLamps,
};
