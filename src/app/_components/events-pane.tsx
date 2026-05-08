"use client";

import { useState } from "react";
import type { Character, WorldEvent } from "@/domain/types";

const CATEGORY_COLOR: Record<string, string> = {
  social: "var(--color-pixel-accent)",
  action: "var(--color-pixel-fg)",
  inner: "var(--color-pixel-muted)",
  env: "var(--color-pixel-success)",
  burst: "var(--color-pixel-danger)",
  quest: "var(--color-pixel-accent)",
  system: "var(--color-pixel-border-light)",
  time: "var(--color-pixel-muted)",
};

export function EventsPane({
  events,
  characters,
}: {
  events: WorldEvent[];
  characters: Character[];
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-3">
      {events.length === 0 ? (
        <p className="text-game-base text-(--color-pixel-muted)">尚无事件…</p>
      ) : (
        <ol className="space-y-2">
          {events.map((ev) => {
            const color = CATEGORY_COLOR[ev.category] ?? "var(--color-pixel-fg)";
            const hasTranscript =
              ev.dialogTranscript && ev.dialogTranscript.length > 0;
            const isExpanded = expandedIds.has(ev.id);

            return (
              <li
                key={ev.id}
                className="text-game-base leading-snug pl-2 border-l-2"
                style={{ borderColor: color }}
              >
                <div className="text-game-xs text-(--color-pixel-muted)">
                  t={ev.tick} · {ev.category} · 强度 {ev.intensity}
                  {hasTranscript ? " · 对话" : ""}
                </div>
                <div className="text-(--color-pixel-fg)">{ev.description}</div>
                {ev.participants.length > 0 && (
                  <div className="text-game-xs text-(--color-pixel-muted)">
                    参与者：
                    {ev.participants
                      .map((p) => charById.get(p)?.name ?? p)
                      .join("、")}
                  </div>
                )}
                {hasTranscript && (
                  <button
                    className="text-game-xs text-(--color-pixel-accent) mt-1 hover:underline cursor-pointer"
                    onClick={() => toggleExpand(ev.id)}
                  >
                    {isExpanded ? "收起对话 ▲" : "展开对话 ▼"}
                  </button>
                )}
                {hasTranscript && isExpanded && (
                  <div className="mt-2 p-2 bg-(--color-pixel-bg-subtle) rounded border border-(--color-pixel-border-light) text-game-sm">
                    {ev.dialogTranscript!.map((turn: any, i: number) => {
                      if (!turn) return null;
                      const speakerName =
                        charById.get(turn.speakerId)?.name ?? turn.speakerId;
                      return (
                        <div key={i} className="mb-1">
                          <span className="font-semibold text-(--color-pixel-accent)">
                            {speakerName}：
                          </span>
                          <span className="text-(--color-pixel-fg)">
                            {turn.line ?? ""}
                          </span>
                        </div>
                      );
                    })}
                    {ev.dialogEndedBy && ev.dialogEndedBy !== "natural" && (
                      <div className="text-game-xs text-(--color-pixel-muted) mt-1">
                        （对话结束方式：{ev.dialogEndedBy}）
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
