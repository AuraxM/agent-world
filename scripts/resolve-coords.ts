/**
 * 坐标精算 + 防重叠校验。
 *
 * 输入：骨架 JSON + LLM 填充的节点 JSON → 输出带最终 x/y/w/h 的 map 节点列表。
 *
 * 用法：
 *   tsx scripts/resolve-coords.ts <skeleton.json> <filled-nodes.json> [--output map.json]
 *
 * 填充节点格式 (filled-nodes.json):
 * [
 *   {
 *     "slotId": "slot-00",
 *     "mergedFrom": ["slot-00", "slot-01"],  // 可选：合并相邻 slot
 *     "skipped": false,                       // 可选：跳过此 slot
 *     "node": { ... MapNodeConfig 字段（不含 x/y/w/h） }
 *   },
 *   ...
 * ]
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Skeleton, FilledNode } from "@/engine/layout-types";
import type { MapNodeConfig } from "@/config/types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxesOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 推挤重叠的节点（简单位移法，最多 3 轮） */
function resolveOverlaps(nodes: (MapNodeConfig & Rect)[]): (MapNodeConfig & Rect)[] {
  for (let round = 0; round < 3; round++) {
    let hadOverlap = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (boxesOverlap(nodes[i], nodes[j])) {
          hadOverlap = true;
          // 将 j 向右推
          nodes[j] = {
            ...nodes[j],
            x: nodes[i].x + nodes[i].w + 1,
          };
        }
      }
    }
    if (!hadOverlap) break;
  }
  return nodes;
}

/** 从填充节点计算最终坐标 */
function resolveCoords(skeleton: Skeleton, filled: FilledNode[]): (MapNodeConfig & Rect)[] {
  // 建立 slot id → slot 映射
  const slotMap = new Map(skeleton.slots.map((s) => [s.id, s]));

  const result: (MapNodeConfig & Rect)[] = [];

  for (const fn of filled) {
    if (fn.skipped) continue;

    const slotIds = fn.mergedFrom && fn.mergedFrom.length > 0 ? fn.mergedFrom : [fn.slotId];

    // 从骨架获取所有相关 slot 并计算包围盒
    const rects: Rect[] = [];
    for (const sid of slotIds) {
      const slot = slotMap.get(sid);
      if (!slot) {
        console.warn(`slot ${sid} not found in skeleton`);
        continue;
      }
      rects.push({ x: slot.x, y: slot.y, w: slot.w, h: slot.h });
    }

    if (rects.length === 0) {
      console.warn(`filled node with slotId=${fn.slotId} has no valid slots`);
      continue;
    }

    // 包围盒
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));

    result.push({
      ...(fn.node as MapNodeConfig),
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    });
  }

  // 防重叠校验 + 推挤
  const resolved = resolveOverlaps(result);

  // 最终校验
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      if (boxesOverlap(resolved[i], resolved[j])) {
        console.error(`OVERLAP after resolution: ${resolved[i].id} ↔ ${resolved[j].id}`);
        process.exit(1);
      }
    }
  }

  return resolved;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
    console.log(
      [
        "resolve-coords.ts — 坐标精算 + 防重叠",
        "",
        "用法: tsx scripts/resolve-coords.ts <skeleton.json> <filled-nodes.json> [--output out.json]",
      ].join("\n"),
    );
    process.exit(args.length < 2 ? 1 : 0);
  }

  const skeletonFile = args[0];
  const filledFile = args[1];
  const outputIdx = args.findIndex((a) => a === "--output" || a === "-o");
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : "resolved-nodes.json";

  const skeleton: Skeleton = JSON.parse(readFileSync(skeletonFile, "utf8"));
  const filled: FilledNode[] = JSON.parse(readFileSync(filledFile, "utf8"));

  const resolved = resolveCoords(skeleton, filled);

  writeFileSync(outputFile, JSON.stringify(resolved, null, 2), "utf8");
  console.log(`resolved ${resolved.length} nodes → ${outputFile}`);
}

main();
