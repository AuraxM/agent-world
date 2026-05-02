"use client";

import { useState } from "react";
import type { Character, MapNode } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { indexNodes } from "../_lib/world";
import { PixelFrame } from "./pixel-frame";

function VitalBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, value * 10);
  const danger = value >= 7;
  const warn = value >= 4;
  const color = danger
    ? "var(--color-pixel-danger)"
    : warn
      ? "var(--color-pixel-accent)"
      : "var(--color-pixel-success)";
  return (
    <div className="flex items-center gap-1 text-game-xs">
      <span className="text-(--color-pixel-muted) w-6">{label}</span>
      <div className="flex-1 h-2 bg-(--color-pixel-bg) border border-(--color-pixel-border-dark) overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="w-3 text-right text-(--color-pixel-fg)">{value}</span>
    </div>
  );
}

interface Template {
  id: string;
  name: string;
  avatar: string | null;
}

export function CharacterRail({
  characters,
  nodes,
  selectedId,
  onSelect,
  templates,
  onPlace,
  disabled,
}: {
  characters: Character[];
  nodes: MapNode[];
  selectedId: string | null;
  onSelect: (c: Character) => void;
  templates: Template[];
  onPlace: (characterId: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const [tab, setTab] = useState<"in" | "out">("in");
  const [placingId, setPlacingId] = useState<string | null>(null);
  const nodeById = indexNodes(nodes);
  const inSceneIds = new Set(characters.map((c) => c.id));
  const offSceneTemplates = templates.filter((t) => !inSceneIds.has(t.id));

  async function handlePlace(id: string) {
    if (disabled || placingId) return;
    setPlacingId(id);
    try {
      await onPlace(id);
    } finally {
      setPlacingId(null);
    }
  }

  return (
    <PixelFrame
      title={
        <span className="flex items-center gap-2">
          <button
            onClick={() => setTab("in")}
            className={
              "px-2 py-0.5 text-game-xs " +
              (tab === "in"
                ? "text-(--color-pixel-accent) border-b border-(--color-pixel-accent)"
                : "text-(--color-pixel-muted) hover:text-(--color-pixel-fg)")
            }
          >
            在场 ({characters.length})
          </button>
          <button
            onClick={() => setTab("out")}
            className={
              "px-2 py-0.5 text-game-xs " +
              (tab === "out"
                ? "text-(--color-pixel-accent) border-b border-(--color-pixel-accent)"
                : "text-(--color-pixel-muted) hover:text-(--color-pixel-fg)")
            }
          >
            未入场 ({offSceneTemplates.length})
          </button>
        </span>
      }
      className="flex flex-col h-full min-h-0 overflow-hidden"
    >
      {tab === "in" ? (
        <ul className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-2 space-y-2">
          {characters.map((c) => {
            const here = nodeById.get(c.locationId);
            const selected = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={`w-full text-left p-2 flex gap-2 items-start border-2 transition-colors ${
                    selected
                      ? "border-(--color-pixel-accent) bg-(--color-pixel-bg-2)"
                      : "border-(--color-pixel-border-dark) bg-(--color-pixel-bg) hover:bg-(--color-pixel-bg-2)"
                  }`}
                >
                  <span
                    className={`npc-chip ${selected ? "npc-chip--selected" : ""}`}
                  >
                    {NPC_EMOJI[c.id] ?? NPC_FALLBACK_EMOJI}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1">
                      <span className="text-game-base text-(--color-pixel-fg) truncate">
                        {c.name}
                      </span>
                    </div>
                    <div className="text-game-xs text-(--color-pixel-muted) truncate">
                      @ {here?.name ?? c.locationId}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <VitalBar label="饿" value={c.vitals.hunger} />
                      <VitalBar label="累" value={c.vitals.fatigue} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-2 space-y-2">
          {offSceneTemplates.length === 0 ? (
            <li className="text-game-xs text-(--color-pixel-muted) p-2">
              所有角色都已入场。
            </li>
          ) : (
            offSceneTemplates.map((t) => {
              const isPlacing = placingId === t.id;
              return (
                <li key={t.id}>
                  <div className="w-full text-left p-2 flex gap-2 items-center border-2 border-(--color-pixel-border-dark) bg-(--color-pixel-bg)">
                    <span className="npc-chip">
                      {NPC_EMOJI[t.id] ?? NPC_FALLBACK_EMOJI}
                    </span>
                    <span className="flex-1 text-game-base text-(--color-pixel-fg) truncate">
                      {t.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handlePlace(t.id)}
                      disabled={disabled || placingId !== null}
                      className="px-2 py-0.5 text-game-xs border border-(--color-pixel-accent) text-(--color-pixel-accent) hover:bg-(--color-pixel-bg-2) disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isPlacing ? "投放中…" : "投放 ▶"}
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </PixelFrame>
  );
}
