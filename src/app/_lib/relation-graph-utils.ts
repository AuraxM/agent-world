import type { Character, Relation } from "@/domain/types";
import type { ObjectiveRelationKind } from "@/domain/enums";

export interface GraphNode {
  id: string;
  name: string;
  avatar: string;
  relationCount: number;
}

export interface GraphLink {
  source: string;
  target: string;
  affection: number;
  kinds: ObjectiveRelationKind[];
  note?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** 从角色列表构建力导向图数据。过滤掉 relations 中已不存在的 target。 */
export function buildGraphData(characters: Character[]): GraphData {
  const charSet = new Set(characters.map((c) => c.id));
  const nodes: GraphNode[] = characters.map((c) => ({
    id: c.id,
    name: c.name,
    avatar: c.avatar || "",
    relationCount: Object.keys(c.relations).length,
  }));

  const links: GraphLink[] = [];
  for (const c of characters) {
    for (const [targetId, rel] of Object.entries(c.relations)) {
      if (!charSet.has(targetId)) continue;
      links.push({
        source: c.id,
        target: targetId,
        affection: rel.affection,
        kinds: rel.kinds,
        note: rel.note,
      });
    }
  }

  return { nodes, links };
}

/**
 * 好感度 → Canvas rgba 颜色。
 * - positive → green (rgba 34,197,94)
 * - negative → red (rgba 239,68,68)
 * - zero → gray (rgba 156,163,175)
 * alpha 随 |affection| 线性映射：±1 → 0.4, ±4 → 1.0
 */
export function affectionColor(affection: number): string {
  if (affection > 0) {
    const alpha = 0.2 + (affection / 4) * 0.8;
    return `rgba(34,197,94,${alpha.toFixed(2)})`;
  }
  if (affection < 0) {
    const alpha = 0.2 + (Math.abs(affection) / 4) * 0.8;
    return `rgba(239,68,68,${alpha.toFixed(2)})`;
  }
  return "rgba(156,163,175,0.5)";
}

/** 节点半径（面积 ∝ relationCount），返回半径像素值（最小 14 = 28px 直径，最大 28 = 56px 直径）。 */
export function nodeRadius(relationCount: number, maxCount: number): number {
  const MIN = 14;
  const MAX = 28;
  if (maxCount <= 0) return MIN;
  const t = relationCount / maxCount;
  return MIN + t * (MAX - MIN);
}

/** 检查给定 link 是否存在反向关系（target→source 也有入口）。 */
export function hasBidirectional(
  link: GraphLink,
  allLinks: readonly GraphLink[],
): boolean {
  return allLinks.some(
    (l) => l.source === link.target && l.target === link.source,
  );
}

/** 计算径向聚焦模式下的节点固定位置。 */
export function computeRadialPositions(
  focusId: string,
  graphData: GraphData,
  centerX: number,
  centerY: number,
  radius: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  positions.set(focusId, { x: centerX, y: centerY });

  const neighborLinks = graphData.links.filter((l) => l.source === focusId);
  if (neighborLinks.length === 0) return positions;

  const angleStep = (2 * Math.PI) / neighborLinks.length;
  const sorted = [...neighborLinks].sort((a, b) => b.affection - a.affection);

  sorted.forEach((link, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const offset =
      link.affection > 0
        ? radius * 0.7
        : link.affection < 0
          ? radius * 1.3
          : radius;
    positions.set(link.target, {
      x: centerX + offset * Math.cos(angle),
      y: centerY + offset * Math.sin(angle),
    });
  });

  return positions;
}
