/**
 * Scope → 角色感知队列分发。
 *
 * scope 语义：
 * - private：仅 audienceCharacterId 看见
 * - node：在 event.nodeId 的角色看见
 * - parent：在 event.nodeId 或其父节点的角色看见
 * - children：在 event.nodeId 或其后代节点的角色看见
 * - global：所有角色看见
 *
 * 节点不可见性（visibleFromParent=false）暂不在 Stage 1 严格生效——所有 scope
 * 都基于树形结构判定，而非"视线"。
 */
import type { Character, MapNode, WorldEvent } from "../domain/index";

type CharacterId = string;

interface NodeIndex {
  byId: Map<string, MapNode>;
  childrenOf: Map<string, string[]>;
}

function buildIndex(nodes: MapNode[]): NodeIndex {
  const byId = new Map<string, MapNode>();
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    byId.set(n.id, n);
    if (n.parentId) {
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n.id);
      childrenOf.set(n.parentId, arr);
    }
  }
  return { byId, childrenOf };
}

function descendants(nodeId: string, idx: NodeIndex): Set<string> {
  const out = new Set<string>([nodeId]);
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of idx.childrenOf.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

function audienceFor(
  ev: WorldEvent,
  nodes: MapNode[],
  characters: Character[],
  idx: NodeIndex,
): Set<CharacterId> {
  const audience = new Set<CharacterId>();

  switch (ev.scope) {
    case "private": {
      if (ev.audienceCharacterId) audience.add(ev.audienceCharacterId);
      return audience;
    }
    case "global": {
      for (const c of characters) audience.add(c.id);
      return audience;
    }
    case "node": {
      if (!ev.nodeId) return audience;
      for (const c of characters) {
        if (c.locationId === ev.nodeId) audience.add(c.id);
      }
      return audience;
    }
    case "parent": {
      if (!ev.nodeId) return audience;
      const node = idx.byId.get(ev.nodeId);
      const parentId = node?.parentId ?? null;
      const valid = new Set<string>([ev.nodeId]);
      if (parentId) valid.add(parentId);
      for (const c of characters) {
        if (valid.has(c.locationId)) audience.add(c.id);
      }
      return audience;
    }
    case "children": {
      if (!ev.nodeId) return audience;
      const valid = descendants(ev.nodeId, idx);
      for (const c of characters) {
        if (valid.has(c.locationId)) audience.add(c.id);
      }
      return audience;
    }
  }

  return audience;
}

/**
 * 输入所有当前 tick 事件，输出每个角色感知到的事件子集。
 * 同一角色看到的事件保留原顺序。
 */
export function dispatchPerception(
  nodes: MapNode[],
  characters: Character[],
  events: WorldEvent[],
): Map<CharacterId, WorldEvent[]> {
  const idx = buildIndex(nodes);
  const out = new Map<CharacterId, WorldEvent[]>();
  for (const c of characters) out.set(c.id, []);
  for (const ev of events) {
    const audience = audienceFor(ev, nodes, characters, idx);
    for (const cid of audience) {
      out.get(cid)!.push(ev);
    }
  }
  return out;
}
