import { eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { MapNode } from "../../domain/index";
import type { NodeTag, Privacy } from "../../domain/index";

type NodeRow = typeof schema.nodes.$inferSelect;

function rowToNode(n: NodeRow): MapNode {
  return {
    id: n.id, worldId: n.worldId, parentId: n.parentId,
    name: n.name, description: n.description,
    tags: JSON.parse(n.tagsJson) as NodeTag[],
    capacity: n.capacity, privacy: n.privacy as Privacy,
    visibleFromParent: !!n.visibleFromParent,
    shortcuts: JSON.parse(n.shortcutsJson) as string[],
    isEntry: !!n.isEntry, travelCost: n.travelCost ?? undefined,
    x: n.x ?? undefined, y: n.y ?? undefined,
    w: n.w ?? undefined, h: n.h ?? undefined,
    spriteKey: n.spriteKey ?? undefined,
  };
}

function nodeToRow(n: MapNode, worldId: string) {
  return {
    id: n.id, worldId, parentId: n.parentId,
    name: n.name, description: n.description,
    tagsJson: JSON.stringify(n.tags),
    capacity: n.capacity ?? null, privacy: n.privacy,
    visibleFromParent: n.visibleFromParent,
    shortcutsJson: JSON.stringify(n.shortcuts),
    isEntry: n.isEntry, travelCost: n.travelCost ?? null,
    x: n.x ?? null, y: n.y ?? null,
    w: n.w ?? null, h: n.h ?? null,
    spriteKey: n.spriteKey ?? null,
  };
}

export function findNodesByWorld(worldId: string): MapNode[] {
  return db.select().from(schema.nodes)
    .where(eq(schema.nodes.worldId, worldId)).all().map(rowToNode);
}

export function insertNodes(worldId: string, nodes: MapNode[]): void {
  db.transaction((tx) => {
    for (const n of nodes) {
      tx.insert(schema.nodes).values(nodeToRow(n, worldId)).run();
    }
  });
}
