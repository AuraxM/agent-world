"use client";

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
    <div className="flex items-center gap-1 text-[10px]">
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

export function CharacterRail({
  characters,
  nodes,
  selectedId,
  onSelect,
}: {
  characters: Character[];
  nodes: MapNode[];
  selectedId: string | null;
  onSelect: (c: Character) => void;
}) {
  const nodeById = indexNodes(nodes);
  return (
    <PixelFrame title="角色" className="flex flex-col h-full min-h-0 overflow-hidden">
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
                    <span className="text-xs text-(--color-pixel-fg) truncate">
                      {c.name}
                    </span>
                    {c.statuses.length > 0 && (
                      <span className="text-[9px] text-(--color-pixel-muted)">
                        ·{c.statuses.length}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-(--color-pixel-muted) truncate">
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
    </PixelFrame>
  );
}
