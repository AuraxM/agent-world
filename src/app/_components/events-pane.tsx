"use client";

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
  return (
    <div className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-3">
      {events.length === 0 ? (
        <p className="text-xs text-(--color-pixel-muted)">尚无事件…</p>
      ) : (
        <ol className="space-y-2">
          {events.map((ev) => {
            const color = CATEGORY_COLOR[ev.category] ?? "var(--color-pixel-fg)";
            return (
              <li
                key={ev.id}
                className="text-xs leading-snug pl-2 border-l-2"
                style={{ borderColor: color }}
              >
                <div className="text-[10px] text-(--color-pixel-muted)">
                  t={ev.tick} · {ev.category} · 强度 {ev.intensity}
                </div>
                <div className="text-(--color-pixel-fg)">{ev.description}</div>
                {ev.participants.length > 0 && (
                  <div className="text-[10px] text-(--color-pixel-muted)">
                    参与者：
                    {ev.participants
                      .map((p) => charById.get(p)?.name ?? p)
                      .join("、")}
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
