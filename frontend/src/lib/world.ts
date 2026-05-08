import type { Character, MapNode } from "@/types/api.generated";

/** 给定 nodeId 返回其直接子节点（按 name 字典序）。 */
export function childrenOf(nodes: MapNode[], parentId: string | null): MapNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

/** 找到第一个根节点（parentId === null）。 */
export function findRootNode(nodes: MapNode[]): MapNode | null {
  return nodes.find((n) => n.parentId === null) ?? null;
}

/** 从 root 到目标节点的祖先链（含目标自身）。 */
export function pathFromRoot(nodes: MapNode[], targetId: string): MapNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const path: MapNode[] = [];
  let cursor: MapNode | undefined = byId.get(targetId);
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path;
}

/** 按 locationId 分桶 character 列表。 */
export function groupCharactersByLocation(
  characters: Character[],
): Map<string, Character[]> {
  const out = new Map<string, Character[]>();
  for (const c of characters) {
    const arr = out.get(c.locationId) ?? [];
    arr.push(c);
    out.set(c.locationId, arr);
  }
  return out;
}

/** 节点 id → 节点 的便捷查表。 */
export function indexNodes(nodes: MapNode[]): Map<string, MapNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
