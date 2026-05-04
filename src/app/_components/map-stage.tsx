"use client";

import { useState, type CSSProperties } from "react";
import type { Character, MapNode } from "@/domain/types";
import { characterEmoji, paletteVarsFor } from "../_lib/sprite";
import { childrenOf, groupCharactersByLocation, pathFromRoot } from "../_lib/world";
import { PixelFrame } from "./pixel-frame";

const DEFAULT_CANVAS_W = 32;
const DEFAULT_CANVAS_H = 22;

function tileStyle(child: MapNode, canvasW: number, canvasH: number): CSSProperties {
  const x = child.x ?? 0;
  const y = child.y ?? 0;
  const w = child.w ?? 6;
  const h = child.h ?? 4;
  const palette = paletteVarsFor(child.spriteKey);
  return {
    left: `${(x / canvasW) * 100}%`,
    top: `${(y / canvasH) * 100}%`,
    width: `${(w / canvasW) * 100}%`,
    height: `${(h / canvasH) * 100}%`,
    ["--tile-base" as string]: palette.base,
    ["--tile-shadow" as string]: palette.shadow,
    ["--tile-hi" as string]: palette.hi,
  };
}

/** 没有显式坐标时的网格 fallback（每行 3 个）。 */
function fallbackGridStyle(
  index: number,
  total: number,
  canvasW: number,
  canvasH: number,
): CSSProperties {
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(total))));
  const rows = Math.ceil(total / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = canvasW / cols;
  const cellH = canvasH / rows;
  return {
    left: `${(col * cellW + 1) * (100 / canvasW)}%`,
    top: `${(row * cellH + 1) * (100 / canvasH)}%`,
    width: `${(cellW - 2) * (100 / canvasW)}%`,
    height: `${(cellH - 2) * (100 / canvasH)}%`,
  };
}

function NpcSprite({
  c,
  selected,
  onClick,
}: {
  c: Character;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      title={c.name}
      className={`npc-chip ${selected ? "npc-chip--selected" : ""} pixelated cursor-pointer`}
    >
      {characterEmoji(c)}
    </div>
  );
}

export function MinimapTabs({
  children,
}: {
  children: [React.ReactNode, React.ReactNode];
}) {
  const [tab, setTab] = useState<"map" | "relations">("map");
  return (
    <div className="h-full flex flex-col bg-(--frame-2) border-l-2 border-(--border) shadow-[inset_1px_0_0_var(--border-amber))]">
      <div className="flex px-2 bg-(--chrome) border-b border-(--border)">
        <button
          type="button"
          onClick={() => setTab("map")}
          className={`text-pixel-xs px-2.5 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
            tab === "map"
              ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
              : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
          }`}
        >
          小地图
        </button>
        <button
          type="button"
          onClick={() => setTab("relations")}
          className={`text-pixel-xs px-2.5 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
            tab === "relations"
              ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
              : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
          }`}
        >
          关系图
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "map" ? children[0] : children[1]}
      </div>
    </div>
  );
}

export function MapStage({
  nodes,
  characters,
  currentNodeId,
  selectedCharacterId,
  onEnterNode,
  onSelectCharacter,
}: {
  nodes: MapNode[];
  characters: Character[];
  currentNodeId: string;
  selectedCharacterId: string | null;
  onEnterNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
}) {
  const path = pathFromRoot(nodes, currentNodeId);
  const current = path[path.length - 1];
  const children = current ? childrenOf(nodes, current.id) : [];
  const charsByLoc = groupCharactersByLocation(characters);

  // 画布尺寸：取所有子节点 x+w / y+h 最大值，至少 32×22
  const canvasW = Math.max(
    DEFAULT_CANVAS_W,
    ...children.map((c) => (c.x ?? 0) + (c.w ?? 6) + 2),
  );
  const canvasH = Math.max(
    DEFAULT_CANVAS_H,
    ...children.map((c) => (c.y ?? 0) + (c.h ?? 4) + 2),
  );

  const hasLayoutData = children.some(
    (c) => c.x !== undefined && c.y !== undefined,
  );

  // 当前节点直接驻留的 NPC（不在任何子节点里）—— 放底部走廊带
  const npcsHere = current ? charsByLoc.get(current.id) ?? [] : [];

  return (
    <PixelFrame title="场景" className="flex flex-col h-full min-h-0 overflow-hidden">
      <nav
        aria-label="breadcrumb"
        className="flex items-center gap-1 px-3 py-1 text-game-xs text-(--color-pixel-muted) border-b border-(--color-pixel-border-dark) bg-(--color-pixel-bg-2) overflow-x-auto"
      >
        {path.map((n, i) => (
          <span key={n.id} className="flex items-center gap-1 whitespace-nowrap">
            {i > 0 && <span className="text-(--color-pixel-border-light)">›</span>}
            <button
              type="button"
              onClick={() => onEnterNode(n.id)}
              disabled={i === path.length - 1}
              className={`px-1 ${
                i === path.length - 1
                  ? "text-(--color-pixel-accent) cursor-default"
                  : "hover:text-(--color-pixel-fg) underline underline-offset-2 cursor-pointer"
              }`}
            >
              {n.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex-1 p-3 flex items-center justify-center min-h-0 overflow-hidden">
        <div
          className="relative w-full h-full max-w-[900px] aspect-[4/3] bg-(--color-pixel-bg-2) border-2 border-(--color-pixel-border-dark) shadow-[inset_0_0_0_1px_var(--color-pixel-border-light)]"
        >
          {children.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-game-base text-(--color-pixel-muted) max-w-xs leading-relaxed">
                {current?.description || "（这是一个叶子节点）"}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {npcsHere.map((c) => (
                  <NpcSprite
                    key={c.id}
                    c={c}
                    selected={c.id === selectedCharacterId}
                    onClick={() => onSelectCharacter(c)}
                  />
                ))}
                {npcsHere.length === 0 && (
                  <span className="text-game-xs text-(--color-pixel-muted)">空无一人</span>
                )}
              </div>
            </div>
          ) : (
            children.map((child, i) => {
              const style = hasLayoutData
                ? tileStyle(child, canvasW, canvasH)
                : { ...fallbackGridStyle(i, children.length, canvasW, canvasH), ...tileStyle(child, canvasW, canvasH) };
              const isPrivate = child.privacy === "private";
              const here = charsByLoc.get(child.id) ?? [];
              return (
                <button
                  type="button"
                  key={child.id}
                  onClick={() => onEnterNode(child.id)}
                  className={`node-tile pixelated ${isPrivate ? "node-tile--private" : ""}`}
                  style={style}
                  title={child.description}
                >
                  <header className="node-tile__header">
                    {child.name}
                  </header>
                  <div className="node-tile__body pixel-scroll">
                    {here.map((c) => (
                      <NpcSprite
                        key={c.id}
                        c={c}
                        selected={c.id === selectedCharacterId}
                        onClick={() => onSelectCharacter(c)}
                      />
                    ))}
                  </div>
                </button>
              );
            })
          )}

          {/* 当前节点本身的 NPC（在子节点之外，例如小镇主街）*/}
          {children.length > 0 && npcsHere.length > 0 && (
            <div className="absolute inset-x-0 bottom-0 px-2 py-1 flex flex-wrap gap-1 justify-end bg-(--color-pixel-bg)/70 backdrop-blur-[1px] border-t border-(--color-pixel-border-dark)">
              <span className="text-game-xs text-(--color-pixel-muted) self-center mr-1">街上：</span>
              {npcsHere.map((c) => (
                <NpcSprite
                  key={c.id}
                  c={c}
                  selected={c.id === selectedCharacterId}
                  onClick={() => onSelectCharacter(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </PixelFrame>
  );
}
