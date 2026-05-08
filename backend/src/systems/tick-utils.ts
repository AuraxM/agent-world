import { randomUUID } from "node:crypto";
import type { WorldEvent } from "../domain/index";

export function makeInnerEvent(args: {
  worldId: string;
  tick: number;
  charId: string;
  description: string;
  intensity?: 1 | 2 | 3 | 4 | 5;
}): WorldEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    worldId: args.worldId,
    tick: args.tick,
    category: "inner",
    description: args.description,
    participants: [args.charId],
    source: "inner",
    intensity: args.intensity ?? 1,
    scope: "private",
    audienceCharacterId: args.charId,
    duration: 1,
  };
}
