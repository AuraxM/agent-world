"use client";

import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { formatHHMM } from "../_lib/format";

export function EventCard({
  event,
  characters,
  nodes,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  event: WorldEvent;
  characters: Character[];
  nodes: MapNode[];
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const important = event.intensity >= 3;
  const actor = event.participants.length > 0
    ? charById.get(event.participants[0])
    : undefined;
  const loc = event.nodeId ? nodeById.get(event.nodeId) : undefined;

  return (
    <div className={`ev-card ${important ? "ev-card--important" : ""}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {/* Avatar */}
        {actor && (
          <span className="npc-chip w-7 h-7 text-base">
            {NPC_EMOJI[actor.id] ?? NPC_FALLBACK_EMOJI}
          </span>
        )}

        {/* Actor name */}
        {actor && (
          <button
            type="button"
            onClick={() => onSelectCharacter(actor)}
            className="text-body-sm font-semibold text-(--text) hover:underline cursor-pointer"
          >
            {actor.name}
          </button>
        )}

        {/* Location chip */}
        {loc && (
          <button
            type="button"
            onClick={() => onJumpToNode(loc.id)}
            className="text-pixel-xs text-(--text-muted) tracking-[var(--letter-pixel-tight)] bg-(--border-amber)/20 px-1.5 py-0.5 cursor-pointer hover:bg-(--border-amber)/40"
          >
            📍 {loc.name}
          </button>
        )}

        {/* Important tag */}
        {important && (
          <span className="text-pixel-2xs bg-(--danger) text-(--panel) px-1.5 py-0.5 tracking-[var(--letter-pixel)]">
            ⚠ 重要
          </span>
        )}

        {/* Time */}
        <span className="ml-auto text-pixel-xs text-(--text-faint) tracking-[var(--letter-pixel-tight)]">
          {formatHHMM(event.tick)}
        </span>
      </div>

      {/* Description */}
      <div className="text-body-md text-(--text) leading-[var(--lh-normal)]">
        {event.description}
      </div>

      {/* Quote for inner events */}
      {event.category === "inner" && (
        <div className="ev-card__quote">
          &ldquo;{event.description}&rdquo;
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-3">
        {loc && (
          <ActionBtn onClick={() => onJumpToNode(loc.id)}>
            📍 跳到地点
          </ActionBtn>
        )}
        {actor && (
          <>
            <ActionBtn onClick={() => onSelectCharacter(actor)}>
              ⬡ 查看角色
            </ActionBtn>
            <ActionBtn onClick={() => onFollow(actor.id)}>
              👁 跟随
            </ActionBtn>
          </>
        )}
        <ActionBtn onClick={() => {
          try {
            const saved = localStorage.getItem("agent-world.bookmarks") ?? "[]";
            const arr = JSON.parse(saved) as string[];
            if (!arr.includes(event.id)) {
              arr.push(event.id);
              localStorage.setItem("agent-world.bookmarks", JSON.stringify(arr));
            }
          } catch { /* ignore */ }
        }}>
          🔖 收藏
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-pixel-xs text-(--text-muted) border border-(--border-amber) bg-transparent px-2 py-0.5 cursor-pointer hover:bg-(--border-amber)/20 hover:text-(--text) tracking-[var(--letter-pixel-tight)] uppercase"
    >
      {children}
    </button>
  );
}
