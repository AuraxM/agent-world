/**
 * BFS 最短路径：在树 + 捷径图上找从 from 到 to 的最短节点序列。
 * 每步 cost = 1（不含 travelCost）。返回首尾含 from/to 的路径，
 * 不可达返回 null。
 */
import type { MapNode } from "@agw/domain";

export function findPath(
  from: string,
  to: string,
  nodes: MapNode[],
): string[] | null {
  if (from === to) return [from];

  const adj = buildAdjacency(nodes);
  if (!adj.has(from) || !adj.has(to)) return null;

  // BFS
  const queue: string[][] = [[from]];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    const neighbors = adj.get(current) ?? [];

    for (const next of neighbors) {
      if (visited.has(next)) continue;
      const newPath = [...path, next];
      if (next === to) return newPath;
      visited.add(next);
      queue.push(newPath);
    }
  }

  return null;
}

/**
 * 构建无向邻接表：parent ↔ child + shortcuts 双向边。
 */
export function buildAdjacency(
  nodes: MapNode[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    adj.set(n.id, []);
  }

  for (const n of nodes) {
    const list = adj.get(n.id)!;
    // tree edges (bidirectional)
    if (n.parentId) {
      list.push(n.parentId);
      adj.get(n.parentId)?.push(n.id);
    }
    // shortcuts (bidirectional)
    for (const sid of n.shortcuts) {
      if (!list.includes(sid)) list.push(sid);
      const peer = adj.get(sid);
      if (peer && !peer.includes(n.id)) peer.push(n.id);
    }
  }

  return adj;
}
