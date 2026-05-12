"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { Character, MapNode } from "@/types/api.generated";
import { CharacterAvatar } from "./character-avatar";
import { groupCharactersByLocation } from "@/lib/world";

interface WorldMapProps {
  nodes: MapNode[];
  characters: Character[];
  onSelectCharacter: (c: Character) => void;
}

interface PlacedNode {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  x: number;
  y: number;
}

const CANVAS = 2000;
const CENTER = CANVAS / 2;
// 内密外疏：gap 逐圈递增 (200 → 230 → 260 → 290)
const RADII = [0, 200, 430, 690, 980];

function computeLayout(allNodes: MapNode[]): PlacedNode[] {
  const root = allNodes.find((n) => n.parentId === null);
  if (!root) return [];

  const byParent = new Map<string | null, MapNode[]>();
  for (const n of allNodes) {
    const key = n.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }

  const result: PlacedNode[] = [];

  function place(
    nodeId: string,
    depth: number,
    startAngle: number,
    endAngle: number,
  ): void {
    const node = allNodes.find((n) => n.id === nodeId);
    if (!node) return;

    const angle = (startAngle + endAngle) / 2;
    const r = RADII[Math.min(depth, RADII.length - 1)];

    result.push({
      id: node.id,
      name: node.name,
      depth,
      parentId: node.parentId,
      x: CENTER + r * Math.cos(angle),
      y: CENTER + r * Math.sin(angle),
    });

    const children = byParent.get(nodeId) ?? [];
    if (children.length === 0) return;

    const range = endAngle - startAngle;
    children.forEach((child, i) => {
      place(
        child.id,
        depth + 1,
        startAngle + (range * i) / children.length,
        startAngle + (range * (i + 1)) / children.length,
      );
    });
  }

  const fullCircle = 2 * Math.PI;
  place(root.id, 0, -Math.PI / 2, -Math.PI / 2 + fullCircle);

  return result;
}

function nodeColor(depth: number): string {
  const alphas = [0.55, 0.42, 0.32, 0.24, 0.18];
  return `rgba(0,0,0,${alphas[Math.min(depth, alphas.length - 1)]})`;
}

export function WorldMap({ nodes, characters, onSelectCharacter }: WorldMapProps) {
  const placed = useMemo(() => computeLayout(nodes), [nodes]);
  const byId = useMemo(() => {
    const m = new Map<string, PlacedNode>();
    for (const p of placed) m.set(p.id, p);
    return m;
  }, [placed]);
  const charsByLoc = useMemo(
    () => groupCharactersByLocation(characters),
    [characters],
  );

  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const lastDist = useRef<number | null>(null);
  const lastPan = useRef<{ x: number; y: number } | null>(null);

  // Initial zoom-to-fit on mobile
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (window.innerWidth >= 768) return;
    const fitScale = Math.min(
      el.clientWidth / CANVAS,
      el.clientHeight / CANVAS,
      1,
    );
    setTransform({ scale: fitScale, x: 0, y: 0 });
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      lastPan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && lastDist.current != null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scaleChange = dist / lastDist.current;
      lastDist.current = dist;
      setTransform((prev) => ({
        ...prev,
        scale: Math.max(0.15, Math.min(3, prev.scale * scaleChange)),
      }));
    } else if (e.touches.length === 1 && lastPan.current) {
      const dx = e.touches[0].clientX - lastPan.current.x;
      const dy = e.touches[0].clientY - lastPan.current.y;
      lastPan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTransform((prev) => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }));
    }
  }

  function handleTouchEnd() {
    lastDist.current = null;
    lastPan.current = null;
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden md:overflow-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        style={{
          width: CANVAS,
          height: CANVAS,
          transform: `scale(${transform.scale}) translate(${transform.x / transform.scale}px, ${transform.y / transform.scale}px)`,
          transformOrigin: "0 0",
          position: "relative",
        }}
      >
        {/* Background + connection lines SVG */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={CANVAS}
          height={CANVAS}
          viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        >
          <defs>
            <radialGradient id="map-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="30%" stopColor="rgba(255,255,255,0.02)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>
          <rect width={CANVAS} height={CANVAS} fill="url(#map-bg)" />

          {/* Depth rings */}
          {RADII.filter((r) => r > 0).map((r) => (
            <circle
              key={r}
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          ))}

          {/* Orthogonal connection lines */}
          {placed
            .filter((p) => p.parentId)
            .map((p) => {
              const parent = byId.get(p.parentId!);
              if (!parent) return null;
              const mx = parent.x;
              return (
                <path
                  key={`${p.id}`}
                  d={`M ${p.x} ${p.y} L ${mx} ${p.y} L ${mx} ${parent.y}`}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={1}
                />
              );
            })}
        </svg>

        {/* Node cards */}
        {placed.map((p) => {
          const chars = charsByLoc.get(p.id) ?? [];
          const isRoot = p.depth === 0;

          return (
            <div
              key={p.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: p.x, top: p.y }}
            >
              <div
                className={`backdrop-blur-md border border-white/10 rounded-lg transition-colors hover:border-white/20 ${
                  isRoot ? "shadow-[0_0_32px_rgba(255,255,255,0.04)]" : ""
                }`}
                style={{ backgroundColor: nodeColor(p.depth) }}
              >
                {/* Node name */}
                <div
                  className={`text-white/60 tracking-wide ${
                    isRoot
                      ? "text-center text-xs font-semibold px-4 pt-2.5 pb-1.5"
                      : "text-center text-[10px] px-2.5 pt-1.5 pb-1 max-w-[90px] mx-auto truncate"
                  }`}
                >
                  {p.name}
                </div>

                {/* Characters */}
                <div
                  className={`flex flex-wrap gap-1 justify-center ${
                    isRoot
                      ? "px-3 pb-2.5"
                      : chars.length > 0
                        ? "px-2 pb-1.5"
                        : "pb-1.5"
                  }`}
                >
                  {chars.length > 0 ? (
                    chars.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectCharacter(c)}
                        className="hover:scale-125 transition-transform cursor-pointer"
                        title={c.name}
                      >
                        <CharacterAvatar
                          c={c}
                          size={isRoot ? 24 : p.depth === 1 ? 17 : 14}
                        />
                      </button>
                    ))
                  ) : (
                    <span className="text-white/8 text-[9px] select-none">
                      —
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
