"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from "react-force-graph-2d";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});
import type { Character, MapNode } from "@/types/api.generated";
import type { GraphLink, GraphNode } from "@/lib/relation-graph-utils";
import {
  buildGraphData,
  affectionColor,
  nodeRadius,
  hasBidirectional,
  computeRadialPositions,
} from "@/lib/relation-graph-utils";
import { characterEmoji } from "@/lib/sprite";

interface Props {
  characters: Character[];
  selectedCharacterId: string | null;
  nodes: MapNode[];
  onSelectCharacter: (id: string) => void;
}

export function RelationGraph({
  characters,
  selectedCharacterId,
  nodes: _,
  onSelectCharacter,
}: Props) {
  // ── State ──────────────────────────────────────────────────────────
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const linksRef = useRef<readonly GraphLink[]>([]);
  // Double-click detection: track last clicked node and time
  const lastClickRef = useRef<{ nodeId: string; time: number }>({
    nodeId: "",
    time: 0,
  });

  // ── ResizeObserver ─────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Derived data ───────────────────────────────────────────────────
  const graphData = useMemo(() => buildGraphData(characters), [characters]);

  const maxRelationCount = useMemo(
    () =>
      Math.max(1, ...graphData.nodes.map((n) => n.relationCount)),
    [graphData.nodes],
  );

  const charNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of characters) {
      map.set(c.id, c.name);
    }
    return map;
  }, [characters]);

  // Keep linksRef in sync for linkCurvature callback
  useEffect(() => {
    linksRef.current = graphData.links;
  }, [graphData.links]);

  // highlightIds: focusId + its outgoing relation targets (null when no focus)
  const highlightIds = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>();
    set.add(focusId);
    for (const link of graphData.links) {
      if (link.source === focusId) {
        set.add(link.target);
      }
    }
    return set;
  }, [focusId, graphData.links]);

  // ── Radial focus effect ────────────────────────────────────────────
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    const nodesArray = (
      fg as unknown as { graphData: () => { nodes: NodeObject[] } }
    ).graphData().nodes;

    if (focusId) {
      const positions = computeRadialPositions(
        focusId,
        graphData,
        size.width / 2,
        size.height / 2,
        Math.min(size.width, size.height) * 0.35,
      );

      for (const node of nodesArray) {
        const pos = positions.get(node.id as string);
        if (pos) {
          node.fx = pos.x;
          node.fy = pos.y;
        } else {
          // Push non-related nodes to random far positions
          const angle = Math.random() * 2 * Math.PI;
          const distance = Math.max(size.width, size.height) * 1.5;
          node.fx = size.width / 2 + distance * Math.cos(angle);
          node.fy = size.height / 2 + distance * Math.sin(angle);
        }
      }
    } else {
      // Clear all fixed positions
      for (const node of nodesArray) {
        node.fx = undefined;
        node.fy = undefined;
      }
    }

    fg.d3ReheatSimulation();
  }, [focusId, graphData, size]);

  // ── Event handlers ─────────────────────────────────────────────────
  // react-force-graph-2d does not expose onNodeDoubleClick /
  // onBackgroundDoubleClick — use single-click with 300ms timer instead.
  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      const nodeId = node.id as string;
      const now = Date.now();
      const last = lastClickRef.current;
      // Always select on single-click (instant feedback)
      onSelectCharacter(nodeId);
      // Detect double-click: same node within 300ms
      if (last.nodeId === nodeId && now - last.time < 300) {
        setFocusId((prev) => (prev === nodeId ? null : nodeId));
        last.nodeId = "";
        last.time = 0;
        return;
      }
      last.nodeId = nodeId;
      last.time = now;
    },
    [onSelectCharacter],
  );

  const handleBackgroundClick = useCallback(() => {
    // Clear focus on background click
    setFocusId(null);
  }, []);

  const handleLinkHover = useCallback(
    (link: LinkObject | null) => {
      setHoveredLink(link as unknown as GraphLink | null);
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    },
    [],
  );

  // ── Node canvas renderer ────────────────────────────────────────────
  const nodeCanvasObject = useCallback(
    (
      node: NodeObject,
      ctx: CanvasRenderingContext2D,
      globalScale: number,
    ) => {
      const gn = node as unknown as GraphNode;
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const r = nodeRadius(gn.relationCount, maxRelationCount);
      const isSelected = gn.id === selectedCharacterId;
      const isFaded = highlightIds != null && !highlightIds.has(gn.id);

      ctx.globalAlpha = isFaded ? 0.12 : 1;

      // Emoji avatar
      const emoji = characterEmoji({
        id: gn.id,
        avatar: gn.avatar || null,
      });
      const emojiSize = Math.max(12, r * 1.0);
      ctx.font = `${emojiSize}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, nx, ny - r * 0.15);

      // Name label
      const nameSize = Math.max(6, r * 0.42);
      ctx.font = `500 ${nameSize}px "Courier New", monospace`;
      ctx.fillStyle = "#d1d5db";
      ctx.fillText(gn.name, nx, ny + r * 0.7);

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(nx, ny, r + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    },
    [maxRelationCount, selectedCharacterId, highlightIds],
  );

  // ── Empty state ────────────────────────────────────────────────────
  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-(--text-on-frame-muted)">
        暂无角色数据
      </div>
    );
  }

  const focusName =
    focusId != null ? (charNameById.get(focusId) ?? focusId) : null;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onMouseMove={handleMouseMove}
    >
      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        // ── nodeCanvasObject ─────────────────────────────────────────
        nodeCanvasObject={nodeCanvasObject}
        // ── linkCanvasObject ─────────────────────────────────────────
        linkCanvasObject={(
          link: LinkObject,
          ctx: CanvasRenderingContext2D,
          _globalScale: number,
        ) => {
          const gl = link as unknown as GraphLink;
          if (!gl.kinds || gl.kinds.length === 0) return;

          const source =
            typeof link.source === "object" ? link.source : null;
          const target =
            typeof link.target === "object" ? link.target : null;
          if (!source || !target) return;

          const mx = ((source.x ?? 0) + (target.x ?? 0)) / 2;
          const my = ((source.y ?? 0) + (target.y ?? 0)) / 2;

          ctx.font = "6px monospace";
          ctx.fillStyle = affectionColor(gl.affection);
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(gl.kinds[0], mx, my - 3);
        }}
        // ── Link styling ─────────────────────────────────────────────
        linkColor={(link) =>
          affectionColor((link as unknown as GraphLink).affection)
        }
        linkWidth={(link) =>
          Math.max(0.5, Math.abs((link as unknown as GraphLink).affection) * 0.8)
        }
        linkDirectionalArrowLength={(link) =>
          Math.abs((link as unknown as GraphLink).affection) > 0 ? 4 : 0
        }
        linkDirectionalArrowRelPos={0.95}
        linkCurvature={(link) =>
          hasBidirectional(
            link as unknown as GraphLink,
            linksRef.current,
          )
            ? 0.2
            : 0
        }
        // ── Interaction ──────────────────────────────────────────────
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        onLinkHover={handleLinkHover}
        // ── Simulation config ────────────────────────────────────────
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
        minZoom={0.3}
        maxZoom={3}
      />

      {/* ── Tooltip ─────────────────────────────────────────────────── */}
      {hoveredLink && (
        <div
          className="pointer-events-none absolute z-50 max-w-[220px] px-2 py-1.5 text-pixel-xs"
          style={{
            left: mouseRef.current.x + 12,
            top: mouseRef.current.y - 12,
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            color: "var(--text-on-frame)",
          }}
        >
          <div className="font-semibold">
            {charNameById.get(hoveredLink.source) ?? hoveredLink.source} →{" "}
            {charNameById.get(hoveredLink.target) ?? hoveredLink.target}
          </div>
          <div
            className={
              hoveredLink.affection > 0
                ? "text-green-400"
                : hoveredLink.affection < 0
                  ? "text-red-400"
                  : "text-gray-400"
            }
          >
            {hoveredLink.kinds.join(" / ")} (
            {hoveredLink.affection > 0 ? "+" : ""}
            {hoveredLink.affection})
          </div>
          {hoveredLink.note && (
            <div className="italic text-(--text-on-frame-muted)">
              {hoveredLink.note.length > 48
                ? hoveredLink.note.slice(0, 48) + "…"
                : hoveredLink.note}
            </div>
          )}
        </div>
      )}

      {/* ── Radial focus banner ─────────────────────────────────────── */}
      {focusId != null && focusName != null && (
        <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2 border border-(--border) bg-(--panel) px-3 py-1 text-pixel-xs text-(--text-on-frame)">
          {focusName} 的关系圈 · 点击空白处退出
        </div>
      )}

      {/* ── No relations overlay ────────────────────────────────────── */}
      {focusId != null &&
        highlightIds != null &&
        highlightIds.size <= 1 && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="text-body-sm text-(--text-on-frame-muted)">
              该角色暂无关系
            </span>
          </div>
        )}
    </div>
  );
}
