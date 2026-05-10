"use client";

import { useState } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import { CharacterAvatar } from "./character-avatar";
import { formatHHMM } from "@/lib/format";

export function EventCard({
  event,
  characters,
  nodes,
  epoch,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  event: WorldEvent;
  characters: Character[];
  nodes: MapNode[];
  epoch: number;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const [expanded, setExpanded] = useState(false);

  const important = event.intensity >= 3;
  const hasTranscript = event.dialogTranscript && event.dialogTranscript.length > 0;
  const transcriptMsgCount = hasTranscript
    ? event.dialogTranscript!.filter((t) => t && t.speakerId !== "__system__").length
    : 0;
  const dialogueSpeakers = hasTranscript
    ? [...new Set(event.dialogTranscript!.filter(t => t && t.speakerId !== "__system__").map(t => t.speakerId))]
        .map(id => charById.get(id))
        .filter(Boolean) as Character[]
    : [];
  const actor = event.participants.length > 0
    ? charById.get(event.participants[0])
    : undefined;
  const loc = event.nodeId ? nodeById.get(event.nodeId) : undefined;

  return (
    <div className={`rounded border px-4 py-3 relative overflow-hidden ${
      important
        ? "bg-(--accent-strong)/8 border-(--accent-strong)/25"
        : "border-white/10"
    }`}>
      {important && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-(--accent-strong)" />
      )}
      <div className="flex items-center gap-2 mb-1.5">
        {/* Single actor (non-dialogue) */}
        {!hasTranscript && actor && (
          <>
            <CharacterAvatar c={actor} size={16} />
            <button
              type="button"
              onClick={() => onSelectCharacter(actor)}
              className="text-body-sm font-semibold text-white/80 hover:underline cursor-pointer"
            >
              {actor.name}
            </button>
          </>
        )}

        {/* Multi-speaker (dialogue events) */}
        {hasTranscript && dialogueSpeakers.map((speaker, i) => (
          <span key={speaker.id} className="flex items-center gap-1">
            <CharacterAvatar c={speaker} size={16} />
            <button
              type="button"
              onClick={() => onSelectCharacter(speaker)}
              className="text-body-sm font-semibold text-white/80 hover:underline cursor-pointer"
            >
              {speaker.name}
            </button>
            <span className="text-pixel-2xs text-white/30">
              {genderIcon(speaker.gender)} {speaker.age}岁
            </span>
            {i < dialogueSpeakers.length - 1 && (
              <span className="text-white/30 mx-0.5">·</span>
            )}
          </span>
        ))}

        {/* Location chip */}
        {loc && (
          <button
            type="button"
            onClick={() => onJumpToNode(loc.id)}
            className="text-pixel-xs text-white/40 tracking-[var(--letter-pixel-tight)] bg-white/5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/10"
          >
            📍 {loc.name}
          </button>
        )}

        {/* Important tag */}
        {important && (
          <span className="text-pixel-2xs bg-(--accent-strong)/20 text-(--accent-strong) px-1.5 py-0.5 rounded tracking-[var(--letter-pixel)]">
            ⚠ 重要
          </span>
        )}

        {/* Time */}
        <span className="ml-auto text-pixel-xs text-white/30 tracking-[var(--letter-pixel-tight)]">
          {formatHHMM(epoch, event.tick)}
        </span>
      </div>

      {/* Description */}
      <div className="text-body-md text-white/80 leading-[var(--lh-normal)]">
        {event.description}
      </div>

      {/* Quote for inner events */}
      {event.category === "inner" && (
        <div className="bg-white/[0.04] border-l-3 border-white/15 text-white/50 italic px-3 py-2 mt-2 leading-[var(--lh-loose)]">
          &ldquo;{event.description}&rdquo;
        </div>
      )}

      {/* Dialog transcript expand/collapse */}
      {hasTranscript && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-(--accent-strong) mt-2 hover:underline cursor-pointer tracking-[0.1em]"
          >
            {expanded
              ? `收起对话 ▲（${transcriptMsgCount} 条）`
              : `展开对话 ▼（${transcriptMsgCount} 条）${event.dialogEndedBy ? "" : " · 进行中"}`}
          </button>
          {expanded && (
            <div className="mt-2 p-3 bg-white/[0.04] border border-white/10 rounded space-y-1">
              {event.dialogTranscript!.map((turn, i) => {
                if (!turn) return null;
                if (turn.speakerId === "__system__") {
                  return (
                    <div key={i} className="flex items-center gap-2 my-2">
                      <div className="flex-1 h-px bg-white/10" />
                      <span className="text-[10px] text-white/30 whitespace-nowrap">
                        {turn.line ?? ""}
                      </span>
                      <div className="flex-1 h-px bg-white/10" />
                    </div>
                  );
                }
                const speakerName =
                  charById.get(turn.speakerId)?.name ?? turn.speakerId;
                return (
                  <div key={i}>
                    <span className="font-semibold text-(--accent-strong)">
                      {speakerName}：
                    </span>
                    <span className="text-body-sm text-white/80">
                      {turn.line ?? ""}
                    </span>
                  </div>
                );
              })}
              {event.dialogEndedBy && event.dialogEndedBy !== "natural" && (
                <div className="text-[10px] text-white/30 mt-2 pt-1 border-t border-white/10">
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

function genderIcon(gender: string): string {
  if (gender === "male") return "♂";
  if (gender === "female") return "♀";
  return "⚧";
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
      className="text-[10px] text-white/40 border border-white/10 rounded bg-transparent px-2 py-0.5 cursor-pointer hover:bg-white/10 hover:text-white/60"
    >
      {children}
    </button>
  );
}
