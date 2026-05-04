# Relation Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty-shell RelationGraph component with a force-directed + radial-focus dual-mode relationship visualization.

**Architecture:** Pure utility functions in `_lib/relation-graph-utils.ts` handle data transform and visual math (testable). The `RelationGraph` component wraps `react-force-graph-2d` with custom Canvas rendering callbacks, manages focus/tooltip state, and syncs selection with the existing `view.selectCharacter`.

**Tech Stack:** react-force-graph-2d (Canvas + d3-force), ResizeObserver, existing vitest + TypeScript

---

### Task 1: Install react-force-graph-2d

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dependency**

```bash
cd E:/Projects/agent-world && npm install react-force-graph-2d
```

- [ ] **Step 2: Verify types are available**

```bash
ls node_modules/react-force-graph-2d/index.d.ts 2>/dev/null || ls node_modules/@types/react-force-graph-2d/index.d.ts 2>/dev/null || echo "check types manually"
```

If no type declarations found, also run: `npm install -D @types/react-force-graph-2d`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-force-graph-2d dependency

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Create relation-graph-utils.ts

**Files:**
- Create: `src/app/_lib/relation-graph-utils.ts`

- [ ] **Step 1: Write the utility module**

```ts
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
    const alpha = 0.4 + (affection / 4) * 0.6;
    return `rgba(34,197,94,${alpha.toFixed(2)})`;
  }
  if (affection < 0) {
    const alpha = 0.4 + (Math.abs(affection) / 4) * 0.6;
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_lib/relation-graph-utils.ts
git commit -m "feat: add relation-graph data transform and visual math utilities

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Write tests for relation-graph-utils

**Files:**
- Create: `src/app/_lib/relation-graph-utils.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, it } from "vitest";
import {
  affectionColor,
  buildGraphData,
  computeRadialPositions,
  hasBidirectional,
  nodeRadius,
} from "./relation-graph-utils";
import type { Character, Relation } from "@/domain/types";

function mkChar(
  id: string,
  relations: Record<string, Relation> = {},
  overrides: Partial<Character> = {},
): Character {
  return {
    id,
    worldId: "w1",
    name: `Name-${id}`,
    age: 30,
    gender: "male",
    profession: "farmer",
    money: 0,
    incomeLevel: 0,
    expenseExempt: false,
    biography: "",
    origin: "local",
    locationId: "node-1",
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    shortMemory: [],
    dailyMemory: [],
    longMemory: [],
    relations,
    lastSleepTick: 0,
    ...overrides,
  } as Character;
}

function mkRel(partial: Partial<Relation> = {}): Relation {
  return {
    kinds: ["friend"],
    affection: 1,
    since: 0,
    lastInteractionTick: 0,
    ...partial,
  };
}

describe("buildGraphData", () => {
  it("returns empty nodes/links for empty input", () => {
    const result = buildGraphData([]);
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("builds nodes with relationCount for each character", () => {
    const chars = [
      mkChar("a", { b: mkRel(), c: mkRel() }),
      mkChar("b", { a: mkRel() }),
    ];
    const result = buildGraphData(chars);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].relationCount).toBe(2);
    expect(result.nodes[1].relationCount).toBe(1);
  });

  it("builds links from relations", () => {
    const chars = [
      mkChar("a", { b: mkRel({ affection: 3, kinds: ["friend"] }) }),
      mkChar("b", {}),
    ];
    const result = buildGraphData(chars);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].source).toBe("a");
    expect(result.links[0].target).toBe("b");
    expect(result.links[0].affection).toBe(3);
    expect(result.links[0].kinds).toEqual(["friend"]);
  });

  it("filters out relations to non-existent characters", () => {
    const chars = [mkChar("a", { ghost: mkRel() })];
    const result = buildGraphData(chars);
    expect(result.links).toHaveLength(0);
  });

  it("preserves note field on links", () => {
    const chars = [
      mkChar("a", { b: mkRel({ note: "小时候欺负过我" }) }),
      mkChar("b", {}),
    ];
    const result = buildGraphData(chars);
    expect(result.links[0].note).toBe("小时候欺负过我");
  });
});

describe("affectionColor", () => {
  it("returns green with higher alpha for positive affection", () => {
    const lo = affectionColor(1);
    const hi = affectionColor(4);
    expect(lo).toContain("34,197,94");
    expect(hi).toContain("34,197,94");
    expect(lo < hi).toBe(true); // alpha is higher
  });

  it("returns red with higher alpha for stronger negative affection", () => {
    const lo = affectionColor(-1);
    const hi = affectionColor(-4);
    expect(lo).toContain("239,68,68");
    expect(hi).toContain("239,68,68");
  });

  it("returns gray for zero affection", () => {
    const color = affectionColor(0);
    expect(color).toContain("156,163,175");
  });
});

describe("nodeRadius", () => {
  it("returns min radius for zero relations", () => {
    expect(nodeRadius(0, 10)).toBe(14);
  });

  it("returns max radius at maxCount", () => {
    expect(nodeRadius(10, 10)).toBe(28);
  });

  it("returns proportional radius between min and max", () => {
    const r = nodeRadius(5, 10);
    expect(r).toBeGreaterThan(14);
    expect(r).toBeLessThan(28);
  });

  it("clamps to min when maxCount is 0 (avoid division by zero)", () => {
    expect(nodeRadius(5, 0)).toBe(14);
  });
});

describe("hasBidirectional", () => {
  it("detects reverse link", () => {
    const link = { source: "a", target: "b", affection: 2, kinds: ["friend"] } as const;
    const links = [
      link,
      { source: "b", target: "a", affection: 1, kinds: ["friend"] } as const,
    ];
    expect(hasBidirectional(link, links)).toBe(true);
  });

  it("returns false for one-way link", () => {
    const link = { source: "a", target: "b", affection: 2, kinds: ["friend"] } as const;
    expect(hasBidirectional(link, [link])).toBe(false);
  });
});

describe("computeRadialPositions", () => {
  const graphData = {
    nodes: [
      { id: "a", name: "A", avatar: "", relationCount: 2 },
      { id: "b", name: "B", avatar: "", relationCount: 1 },
      { id: "c", name: "C", avatar: "", relationCount: 0 },
    ],
    links: [
      { source: "a", target: "b", affection: 3, kinds: ["friend"] as const },
      { source: "a", target: "c", affection: -1, kinds: ["acquaintance"] as const },
    ],
  };

  it("places focus node at center", () => {
    const pos = computeRadialPositions("a", graphData, 400, 300, 200);
    expect(pos.get("a")).toEqual({ x: 400, y: 300 });
  });

  it("positions related nodes around the center", () => {
    const pos = computeRadialPositions("a", graphData, 400, 300, 200);
    const b = pos.get("b");
    const c = pos.get("c");
    expect(b).toBeDefined();
    expect(c).toBeDefined();
    // b (positive affection) should be closer than c (negative)
    const distB = Math.sqrt((b!.x - 400) ** 2 + (b!.y - 300) ** 2);
    const distC = Math.sqrt((c!.x - 400) ** 2 + (c!.y - 300) ** 2);
    expect(distB).toBeLessThan(distC);
  });
});
```

- [ ] **Step 2: Run tests (expect fail — utils file exists but tests not yet run)**

```bash
npx vitest run src/app/_lib/relation-graph-utils.test.ts
```

Expected: all 14 tests pass.

- [ ] **Step 3: If any tests fail, fix and re-run; then commit**

```bash
git add src/app/_lib/relation-graph-utils.test.ts
git commit -m "test: add unit tests for relation-graph-utils

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Implement RelationGraph component

**Files:**
- Modify: `src/app/_components/relation-graph.tsx` (full rewrite from empty shell)

- [ ] **Step 1: Verify container sizing pattern from existing component**

Check that `relation-graph.tsx` is the file at `src/app/_components/relation-graph.tsx` — it currently contains only the placeholder div. We will replace it entirely.

- [ ] **Step 2: Write the component**

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import type { Character, MapNode } from "@/domain/types";
import { characterEmoji } from "../_lib/sprite";
import {
  affectionColor,
  buildGraphData,
  computeRadialPositions,
  hasBidirectional,
  nodeRadius,
  type GraphLink,
  type GraphNode,
} from "../_lib/relation-graph-utils";

interface Props {
  characters: Character[];
  selectedCharacterId: string | null;
  nodes: MapNode[];
  onSelectCharacter: (id: string) => void;
}

export function RelationGraph({
  characters,
  selectedCharacterId,
  nodes: _nodes,
  onSelectCharacter,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods>();
  const mouseRef = useRef({ x: 0, y: 0 });

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setSize({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build graph data
  const graphData = useMemo(() => buildGraphData(characters), [characters]);
  const linksRef = useRef(graphData.links);
  linksRef.current = graphData.links;

  const maxRelationCount = useMemo(
    () => Math.max(1, ...graphData.nodes.map((n) => n.relationCount)),
    [graphData.nodes],
  );

  // Character name lookup
  const charNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of characters) map.set(c.id, c.name);
    return map;
  }, [characters]);

  // Highlight set for focus mode
  const highlightIds = useMemo(() => {
    if (!focusId) return null;
    const ids = new Set<string>([focusId]);
    for (const link of graphData.links) {
      if (link.source === focusId) ids.add(link.target);
    }
    return ids;
  }, [focusId, graphData.links]);

  // Radial focus mode: pin/unpin node positions
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    if (focusId) {
      const positions = computeRadialPositions(
        focusId,
        graphData,
        size.width / 2,
        size.height / 2,
        Math.min(size.width, size.height) * 0.35,
      );
      const simNodes = fg.graphData().nodes;
      for (const node of simNodes) {
        const pos = positions.get((node as GraphNode).id);
        if (pos) {
          (node as Record<string, unknown>).fx = pos.x;
          (node as Record<string, unknown>).fy = pos.y;
        } else {
          const angle = Math.random() * 2 * Math.PI;
          (node as Record<string, unknown>).fx =
            size.width / 2 + size.width * 0.6 * Math.cos(angle);
          (node as Record<string, unknown>).fy =
            size.height / 2 + size.height * 0.6 * Math.sin(angle);
        }
      }
      fg.d3ReheatSimulation();
    } else {
      const simNodes = fg.graphData().nodes;
      for (const node of simNodes) {
        (node as Record<string, unknown>).fx = undefined;
        (node as Record<string, unknown>).fy = undefined;
      }
      fg.d3ReheatSimulation();
    }
  }, [focusId, graphData, size]);

  // Node canvas rendering
  const nodeCanvasObject = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gn = node as unknown as GraphNode;
      const r = nodeRadius(gn.relationCount, maxRelationCount);
      const isSelected = gn.id === selectedCharacterId;
      const isFaded = highlightIds && !highlightIds.has(gn.id);

      ctx.globalAlpha = isFaded ? 0.12 : 1;

      // Emoji avatar
      const emoji = characterEmoji({ id: gn.id, avatar: gn.avatar || null });
      const emojiSize = Math.max(12, r * 1.0);
      ctx.font = `${emojiSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, gn.x ?? 0, (gn.y ?? 0) - r * 0.15);

      // Name label
      const nameSize = Math.max(6, r * 0.42);
      ctx.font = `500 ${nameSize}px "Courier New", monospace`;
      ctx.fillStyle = "#d1d5db";
      ctx.fillText(gn.name, gn.x ?? 0, (gn.y ?? 0) + r * 0.7);

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(gn.x ?? 0, gn.y ?? 0, r + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    },
    [maxRelationCount, selectedCharacterId, highlightIds],
  );

  // Callbacks
  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      const gn = node as unknown as GraphNode;
      onSelectCharacter(gn.id);
    },
    [onSelectCharacter],
  );

  const handleNodeDoubleClick = useCallback((node: NodeObject) => {
    const gn = node as unknown as GraphNode;
    setFocusId((prev) => (prev === gn.id ? null : gn.id));
  }, []);

  const handleBackgroundDoubleClick = useCallback(() => {
    setFocusId(null);
  }, []);

  const handleLinkHover = useCallback(
    (link: LinkObject | null) => {
      if (!link) {
        setHoveredLink(null);
        return;
      }
      setHoveredLink(link as unknown as GraphLink);
    },
    [],
  );

  // Empty state
  if (graphData.nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-body-sm text-(--text-on-frame-muted)">
        暂无角色数据
      </div>
    );
  }

  const focusedCharName = focusId ? charNameById.get(focusId) ?? focusId : null;
  const focusHasNoRelations =
    focusId && highlightIds && highlightIds.size <= 1;

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative"
      onMouseMove={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          mouseRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          };
        }
      }}
    >
      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={(link: LinkObject, ctx: CanvasRenderingContext2D, _globalScale: number) => {
          const gl = link as unknown as GraphLink;
          if (!gl.kinds || gl.kinds.length === 0) return;

          const source =
            typeof link.source === "object"
              ? (link.source as { x?: number; y?: number })
              : null;
          const target =
            typeof link.target === "object"
              ? (link.target as { x?: number; y?: number })
              : null;
          if (!source || !target) return;
          const mx = ((source.x ?? 0) + (target.x ?? 0)) / 2;
          const my = ((source.y ?? 0) + (target.y ?? 0)) / 2;

          const label = gl.kinds[0];
          ctx.font = "6px monospace";
          ctx.fillStyle = affectionColor(gl.affection);
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(label, mx, my - 3);
        }}
        linkColor={(link: LinkObject) =>
          affectionColor((link as unknown as GraphLink).affection)
        }
        linkWidth={(link: LinkObject) =>
          Math.max(0.5, Math.abs((link as unknown as GraphLink).affection) * 0.8)
        }
        linkDirectionalArrowLength={(link: LinkObject) =>
          Math.abs((link as unknown as GraphLink).affection) > 0 ? 4 : 0
        }
        linkDirectionalArrowRelPos={0.95}
        linkCurvature={(link: LinkObject) =>
          hasBidirectional(
            link as unknown as GraphLink,
            linksRef.current,
          )
            ? 0.2
            : 0
        }
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onBackgroundDoubleClick={handleBackgroundDoubleClick}
        onLinkHover={handleLinkHover}
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
        minZoom={0.3}
        maxZoom={3}
      />

      {/* Tooltip */}
      {hoveredLink && (
        <div
          className="absolute pointer-events-none z-10 bg-(--panel) border border-(--border) px-2 py-1.5 rounded shadow-lg"
          style={{
            left: mouseRef.current.x + 12,
            top: mouseRef.current.y - 12,
            maxWidth: 260,
          }}
        >
          <div className="text-pixel-xs text-(--text-on-frame)">
            {charNameById.get(hoveredLink.source) ?? hoveredLink.source}
            {" → "}
            {charNameById.get(hoveredLink.target) ?? hoveredLink.target}
          </div>
          <div className="text-pixel-xs text-(--text-on-frame-muted)">
            {hoveredLink.kinds.join(" / ")}
            {" · "}
            <span
              style={{
                color:
                  hoveredLink.affection > 0
                    ? "var(--color-pixel-success)"
                    : hoveredLink.affection < 0
                      ? "var(--color-pixel-danger)"
                      : "var(--color-pixel-muted)",
              }}
            >
              {hoveredLink.affection > 0 ? "+" : ""}
              {hoveredLink.affection}
            </span>
          </div>
          {hoveredLink.note && (
            <div className="text-pixel-2xs text-(--text-on-frame-faint) mt-0.5 italic leading-snug max-w-48 truncate">
              &ldquo;{hoveredLink.note}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Focus mode banner */}
      {focusedCharName && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-(--panel) border border-(--border-amber) text-pixel-xs text-(--text-on-frame) rounded pointer-events-none z-10">
          {focusedCharName} 的关系圈 · 双击空白退出
        </div>
      )}

      {/* No-relations overlay */}
      {focusHasNoRelations && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <span className="text-body-sm text-(--text-on-frame-muted) bg-(--panel) px-4 py-2 border border-(--border) rounded">
            该角色暂无关系
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors. If `react-force-graph-2d` exports lack `ForceGraphMethods` type or similar, check the actual export names via:
```bash
node -e "const m = require('react-force-graph-2d'); console.log(Object.keys(m))"
```

Adjust imports accordingly. Common fallback: use `any` for the ref type if `ForceGraphMethods` is not exported.

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/relation-graph.tsx
git commit -m "feat: implement force-directed relation graph with radial focus mode

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Wire Dashboard props

**Files:**
- Modify: `src/app/_components/dashboard.tsx:159`

- [ ] **Step 1: Replace the plain `<RelationGraph />` with props**

In `dashboard.tsx`, change line 159 from:

```tsx
{centerTab === "relations" && <RelationGraph />}
```

To:

```tsx
{centerTab === "relations" && (
  <RelationGraph
    characters={snapshot.characters}
    selectedCharacterId={view.selectedCharacterId}
    nodes={snapshot.nodes}
    onSelectCharacter={(id) => view.selectCharacter(id)}
  />
)}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Should pass — all props match the `Props` interface in relation-graph.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/dashboard.tsx
git commit -m "feat: wire relation graph props from dashboard

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Dev server smoke test

- [ ] **Step 1: Start dev server**

```bash
cd E:/Projects/agent-world && npm run dev
```

- [ ] **Step 2: Verify in browser**

1. Open the app, create/load a world with characters that have relations
2. Click "关系图" center tab → verify graph renders with nodes and edges
3. Hover a link → verify tooltip appears with correct info
4. Click a node → verify right-side profile pane updates
5. Double-click a node → verify radial focus mode activates
6. Double-click blank area → verify return to force-directed mode
7. Pan/zoom → verify interactions work
8. Check a character with no relations → verify they appear as isolated node
9. Check empty world → verify "暂无角色数据" message

- [ ] **Step 6: If issues found, fix and re-verify**
