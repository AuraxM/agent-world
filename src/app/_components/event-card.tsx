"use client";

import { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);

  const important = event.intensity >= 3;
  const hasTranscript = event.dialogTranscript && event.dialogTranscript.length > 0;
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

      {/* Dialog transcript expand/collapse */}
      {hasTranscript && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-pixel-xs text-(--accent-strong) mt-2 hover:underline cursor-pointer tracking-[var(--letter-pixel-tight)]"
          >
            {expanded ? "收起对话 ▲" : "展开对话 ▼"}
          </button>
          {expanded && (
            <div className="mt-2 p-3 bg-(--panel) border border-(--border-amber) rounded space-y-1">
              {event.dialogTranscript!.map((turn, i) => {
                const speakerName =
                  charById.get(turn.speakerId)?.name ?? turn.speakerId;
                if (turn.kind === "leave") {
                  return (
                    <div key={i} className="text-pixel-xs text-(--text-faint) italic">
                      {speakerName} 离开了对话。
                    </div>
                  );
                }
                return (
                  <div key={i}>
                    <span className="font-semibold text-(--accent-strong)">
                      {speakerName}：
                    </span>
                    <span className="text-body-sm text-(--text)">
                      {turn.line ?? ""}
                    </span>
                  </div>
                );
              })}
              {event.dialogEndedBy && event.dialogEndedBy !== "natural" && (
                <div className="text-pixel-2xs text-(--text-faint) mt-2 pt-1 border-t border-(--border-amber)/30">
                  结束方式：{event.dialogEndedBy}
                </div>
              )}
            </div>
          )}
        </>
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
