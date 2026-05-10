"use client";

import type { Character } from "@/types/api.generated";
import { CharacterAvatar } from "./character-avatar";

function actionLabel(c: Character): string {
  if (c.lastThought?.action?.type) return c.lastThought.action.type;
  if (c.currentAction) {
    if (typeof c.currentAction === "string") return c.currentAction;
    return c.currentAction.type ?? "…";
  }
  return "…";
}

export function CharacterList({
  characters,
  selectedId,
  onSelect,
}: {
  characters: Character[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-white/10 text-white/40 text-[10px] uppercase tracking-wider flex-shrink-0">
        人物
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 p-1.5">
        {characters.map((c) => {
          const isSelected = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex items-center justify-between px-3 py-2 rounded text-left cursor-pointer transition-colors ${
                isSelected
                  ? "bg-white/[0.08] border border-(--accent-strong)/30 text-(--accent-strong)"
                  : "border border-transparent text-white/85 hover:bg-white/[0.04] hover:border-white/5"
              }`}
            >
              <span className="text-[12px] truncate min-w-0">
                <CharacterAvatar c={c} size={14} />
                {c.name}
              </span>
              <span
                className={`text-[9px] rounded px-1.5 py-0.5 max-w-[84px] truncate flex-shrink-0 ml-2 ${
                  isSelected
                    ? "bg-(--accent-strong)/15 text-(--accent-strong)/70"
                    : "bg-white/[0.08] text-white/35"
                }`}
              >
                {actionLabel(c)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
