"use client";

import type { Character, MapNode, Personality } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { indexNodes } from "../_lib/world";

const PERSONALITY_LABELS: Record<keyof Personality, string> = {
  ei: "I/E",
  sn: "N/S",
  tf: "F/T",
  jp: "P/J",
};

/** [-4, +4] 格子条形条；和 vitals 同风格。 */
function PersonalityBar({ label, value }: { label: string; value: number }) {
  // value in [-4, 4]; 0 居中。映射到 [0..100]
  const pct = ((value + 4) / 8) * 100;
  const isNeg = value < 0;
  const fillStart = isNeg ? pct : 50;
  const fillEnd = isNeg ? 50 : pct;
  return (
    <div className="flex items-center gap-2 text-game-xs">
      <span className="w-8 text-(--color-pixel-muted)">{label}</span>
      <div className="flex-1 h-2 bg-(--color-pixel-bg) border border-(--color-pixel-border-dark) relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-(--color-pixel-border-light)" />
        <div
          className="absolute inset-y-0"
          style={{
            left: `${fillStart}%`,
            width: `${fillEnd - fillStart}%`,
            background: isNeg
              ? "var(--color-pixel-danger)"
              : "var(--color-pixel-success)",
          }}
        />
      </div>
      <span className="w-8 text-right text-(--color-pixel-fg)">{value}</span>
    </div>
  );
}

export function ProfilePane({
  character,
  nodes,
  onJumpToNode,
  characters,
}: {
  character: Character | null;
  nodes: MapNode[];
  onJumpToNode: (nodeId: string) => void;
  characters: Character[];
}) {
  if (!character) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        <p className="text-game-base text-(--color-pixel-muted) text-center max-w-xs leading-relaxed">
          点击左栏角色卡片或地图上的角色，
          <br />
          查看完整档案与上一轮思考。
        </p>
      </div>
    );
  }

  const nodeById = indexNodes(nodes);
  const here = nodeById.get(character.locationId);
  const charById = new Map(characters.map((c) => [c.id, c]));
  const lastThought = character.lastThought;
  const recentMemories = [...character.shortMemory]
    .sort((a, b) => b.tick - a.tick)
    .slice(0, 5);
  const topRelations = Object.entries(character.relations)
    .sort((a, b) => Math.abs(b[1].affection) - Math.abs(a[1].affection))
    .slice(0, 5);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-3 space-y-3">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <span className="npc-chip npc-chip--lg npc-chip--selected pixelated">
          {NPC_EMOJI[character.id] ?? NPC_FALLBACK_EMOJI}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-game-lg text-(--color-pixel-fg)">{character.name}</div>
          <button
            type="button"
            onClick={() => onJumpToNode(character.locationId)}
            className="text-game-sm text-(--color-pixel-accent) hover:underline"
          >
            @ {here?.name ?? character.locationId} ↗
          </button>
        </div>
      </div>

      {/* 上一轮思考 */}
      <section className="border-2 border-(--color-pixel-accent-dark) bg-(--color-pixel-bg-2) p-2 space-y-1">
        <div className="flex items-center gap-2 text-game-xs uppercase tracking-widest text-(--color-pixel-accent)">
          <span>上一轮思考</span>
          {lastThought && (
            <>
              <span className="text-(--color-pixel-muted)">·</span>
              <span className="text-(--color-pixel-muted)">t={lastThought.tick}</span>
              <span className="text-(--color-pixel-muted)">·</span>
              <span className="text-(--color-pixel-muted)">{lastThought.action.type}</span>
              <span
                className="ml-auto px-1 text-game-2xs"
                style={{
                  background: lastThought.success
                    ? "var(--color-pixel-success)"
                    : "var(--color-pixel-danger)",
                  color: "var(--color-pixel-border-dark)",
                }}
              >
                {lastThought.success ? "OK" : "FAIL"}
              </span>
            </>
          )}
        </div>
        {!lastThought ? (
          <p className="text-game-sm text-(--color-pixel-muted)">
            还没有过决策（推进 1 小时后再来看）。
          </p>
        ) : (
          <>
            {lastThought.action.emotionTag && (
              <div className="inline-block text-game-xs px-1 bg-(--color-pixel-accent) text-(--color-pixel-border-dark)">
                {lastThought.action.emotionTag}
              </div>
            )}
            <div className="max-h-40 overflow-y-auto pixel-scroll text-game-sm leading-relaxed text-(--color-pixel-fg) whitespace-pre-wrap">
              {lastThought.action.reasoning}
            </div>
            {lastThought.action.freeText && (
              <div className="text-game-sm text-(--color-pixel-muted) italic border-t border-(--color-pixel-border-dark) pt-1">
                &ldquo;{lastThought.action.freeText}&rdquo;
              </div>
            )}
          </>
        )}
      </section>

      {/* 性格 */}
      <section>
        <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
          性格
        </div>
        <div className="space-y-0.5">
          {(Object.entries(character.personality) as Array<[keyof Personality, number]>).map(
            ([k, v]) => (
              <PersonalityBar key={k} label={PERSONALITY_LABELS[k]} value={v} />
            ),
          )}
        </div>
      </section>

      {/* 生理状态 */}
      <section>
        <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
          生理
        </div>
        <div className="text-game-sm text-(--color-pixel-fg) flex flex-wrap gap-x-3 gap-y-0.5">
          <span>饿 {character.vitals.hunger}</span>
          <span>累 {character.vitals.fatigue}</span>
          <span>脏 {character.vitals.hygiene}</span>
        </div>
      </section>

      {/* 情绪 */}
      <section>
        <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
          情绪
        </div>
        <div className="text-game-sm text-(--color-pixel-fg) flex flex-wrap gap-x-3 gap-y-0.5">
          <span>心情 {character.emotion.mood}</span>
          <span>压力 {character.emotion.stress}</span>
          <span>社交 {character.emotion.social_satiety}</span>
        </div>
      </section>

      {/* 关系 */}
      {topRelations.length > 0 && (
        <section>
          <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
            关系
          </div>
          <ul className="space-y-1">
            {topRelations.map(([id, rel]) => (
              <li key={id} className="text-game-sm flex gap-2 items-baseline">
                <span className="text-(--color-pixel-fg) min-w-[60px]">
                  {charById.get(id)?.name ?? id}
                </span>
                <span className="text-(--color-pixel-muted) truncate">
                  {rel.kinds.join("/")}
                </span>
                <span
                  className="ml-auto"
                  style={{
                    color:
                      rel.affection >= 0
                        ? "var(--color-pixel-success)"
                        : "var(--color-pixel-danger)",
                  }}
                >
                  {rel.affection > 0 ? "+" : ""}
                  {rel.affection}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 短期记忆 */}
      {recentMemories.length > 0 && (
        <section>
          <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
            最近记忆
          </div>
          <ul className="space-y-1">
            {recentMemories.map((m) => (
              <li key={m.id} className="text-game-sm text-(--color-pixel-fg) leading-snug">
                <span className="text-(--color-pixel-muted)">t={m.tick}·★{m.importance}</span>{" "}
                {m.content}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
