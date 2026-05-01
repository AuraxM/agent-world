import type { Character, MapNode, World, WorldEvent } from "@/domain/types";

export interface WorldSnapshot {
  world: World;
  nodes: MapNode[];
  characters: Character[];
}

export interface EventsResponse {
  events: WorldEvent[];
}

export interface TickResponse {
  worldId: string;
  fromTick: number;
  toTick: number;
}
