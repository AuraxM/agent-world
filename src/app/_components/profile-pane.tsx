"use client";

import { type ReactNode, useState } from "react";
import type { Character, MapNode, Personality } from "@/domain/types";
import { affectionTone, formatActionWindow, vitalThreshold } from "../_lib/profile-format";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { indexNodes } from "../_lib/world";

const PERSONALITY_LABELS: Record<keyof Personality, string> = {
  ei: "I/E",
  sn: "N/S",
  tf: "F/T",
  jp: "P/J",
};

/** [-min..+max] 双向条；居中分隔线，负值左红、正值右绿。 */
function BiBar({
  label,
  value,
  min = -4,
  max = 4,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
}) {
  const span = max - min;
  const pct = ((value - min) / span) * 100;
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

/** [0..max] 单向条；颜色按 (danger, warn) 阈值渐变。 */
function UniBar({
  label,
  value,
  max,
  danger,
  warn,
}: {
  label: string;
  value: number;
  max: number;
  danger: number;
  warn: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const tier = vitalThreshold(value, danger, warn);
  const color =
    tier === "danger"
      ? "var(--color-pixel-danger)"
      : tier === "warn"
        ? "var(--color-pixel-accent)"
        : "var(--color-pixel-success)";
  return (
    <div className="flex items-center gap-2 text-game-xs">
      <span className="w-8 text-(--color-pixel-muted)">{label}</span>
      <div className="flex-1 h-2 bg-(--color-pixel-bg) border border-(--color-pixel-border-dark) overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-(--color-pixel-fg)">{value}</span>
    </div>
  );
}

/** Section 标题：label + 可选 X/Y 计数 + 可选展开/收起按钮。 */
function SectionLabel({
  children,
  shown,
  total,
  expanded,
  onToggle,
}: {
  children: ReactNode;
  shown?: number;
  total?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const showCount = total !== undefined;
  const showToggle = onToggle !== undefined && total !== undefined && shown !== undefined && total > shown;
  return (
    <div className="flex items-center gap-2 text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
      <span>{children}</span>
      {showCount && (
        <span className="px-1 bg-(--color-pixel-bg-2) border border-(--color-pixel-border-dark) text-game-2xs normal-case tracking-normal">
          {shown !== undefined ? `${shown}/${total}` : total}
        </span>
      )}
      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-(--color-pixel-accent) hover:underline normal-case tracking-normal"
        >
          {expanded ? "收起 ▴" : "展开 ▾"}
        </button>
      )}
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
  const characterId = character?.id;
  const [thoughtExpanded, setThoughtExpanded] = useState(false);
  const [relationsExpanded, setRelationsExpanded] = useState(false);
  const [lastCharacterId, setLastCharacterId] = useState(characterId);
  if (lastCharacterId !== characterId) {
    setLastCharacterId(characterId);
    setThoughtExpanded(false);
    setRelationsExpanded(false);
  }

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
  const sortedRelations = Object.entries(character.relations).sort(
    (a, b) => Math.abs(b[1].affection) - Math.abs(a[1].affection),
  );
  const totalRelations = sortedRelations.length;
  const visibleRelations = relationsExpanded ? sortedRelations : sortedRelations.slice(0, 5);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-3 space-y-3">
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <span className="npc-chip npc-chip--lg npc-chip--selected pixelated" style={{ fontSize: "36px", width: "60px", height: "60px" }}>
          {NPC_EMOJI[character.id] ?? NPC_FALLBACK_EMOJI}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-game-lg text-(--color-pixel-fg)">{character.name}</div>
          <div className="text-game-sm">
            <button
              type="button"
              onClick={() => onJumpToNode(character.locationId)}
              className="text-(--color-pixel-accent) hover:underline"
            >
              @ {here?.name ?? character.locationId} ↗
            </button>
            {character.homeNodeId
              && character.homeNodeId !== character.locationId
              && nodeById.get(character.homeNodeId) && (
                <span className="text-(--color-pixel-muted)">
                  {" · 家 "}
                  {nodeById.get(character.homeNodeId)?.name}
                </span>
              )}
          </div>
          {character.currentAction && (
            <div>
              <span
                className="inline-block px-1 text-game-xs"
                style={{
                  background: "var(--color-pixel-accent)",
                  color: "var(--color-pixel-border-dark)",
                  border: "1px solid var(--color-pixel-accent-dark)",
                }}
              >
                {formatActionWindow(character.currentAction)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 上一轮思考 */}
      <section className="border-2 border-(--color-pixel-border-dark) bg-(--color-pixel-bg-2) p-2 space-y-1">
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
            <div
              className={`text-game-sm leading-relaxed text-(--color-pixel-fg) whitespace-pre-wrap ${
                thoughtExpanded ? "" : "line-clamp-4"
              }`}
            >
              {lastThought.action.reasoning}
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => setThoughtExpanded((v) => !v)}
                className="text-game-xs text-(--color-pixel-accent) hover:underline"
              >
                {thoughtExpanded ? "收起 ▴" : "展开全文 ▾"}
              </button>
            </div>
            {lastThought.action.freeText && (
              <div className="text-game-sm text-(--color-pixel-muted) italic border-t border-(--color-pixel-border-dark) pt-1">
                &ldquo;{lastThought.action.freeText}&rdquo;
              </div>
            )}
          </>
        )}
      </section>

      {/* 状态仪表盘（hero） */}
      <section
        className="border-2 border-(--color-pixel-accent-dark) bg-(--color-pixel-bg-2) p-2"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-pixel-accent)" }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
              生理
            </div>
            <div className="space-y-0.5">
              <UniBar label="饿" value={character.vitals.hunger} max={16} danger={10} warn={6} />
              <UniBar label="累" value={character.vitals.fatigue} max={16} danger={10} warn={6} />
              <UniBar label="脏" value={character.vitals.hygiene} max={16} danger={10} warn={6} />
            </div>
          </div>
          <div>
            <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
              情绪
            </div>
            <div className="space-y-0.5">
              <BiBar label="心" value={character.emotion.mood} />
              <UniBar label="压" value={character.emotion.stress} max={4} danger={3} warn={2} />
              <BiBar label="社" value={character.emotion.social_satiety} />
            </div>
          </div>
        </div>
      </section>

      {/* 性格 */}
      <section>
        <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
          性格
        </div>
        <div className="space-y-0.5">
          {(Object.entries(character.personality) as Array<[keyof Personality, number]>).map(
            ([k, v]) => (
              <BiBar key={k} label={PERSONALITY_LABELS[k]} value={v} />
            ),
          )}
        </div>
      </section>

      {/* 关系 */}
      <section>
        <SectionLabel
          shown={Math.min(visibleRelations.length, totalRelations)}
          total={totalRelations}
          expanded={relationsExpanded}
          onToggle={() => setRelationsExpanded((v) => !v)}
        >
          关系
        </SectionLabel>
        {totalRelations === 0 ? (
          <p className="text-game-sm text-(--color-pixel-muted)">尚无任何关系</p>
        ) : (
          <ul className="space-y-1">
            {visibleRelations.map(([id, rel]) => {
              const tone = affectionTone(rel.affection);
              return (
                <li key={id} className="text-game-sm grid grid-cols-[18px_1fr_auto] gap-2 items-baseline">
                  <span className="text-base">
                    {NPC_EMOJI[id] ?? NPC_FALLBACK_EMOJI}
                  </span>
                  <div className="min-w-0">
                    <div>
                      <span className="text-(--color-pixel-fg)">
                        {charById.get(id)?.name ?? id}
                      </span>
                      <span className="text-(--color-pixel-muted) text-game-xs"> · {rel.kinds.join("/")}</span>
                    </div>
                    {rel.note && (
                      <div className="text-game-xs text-(--color-pixel-muted) italic truncate">
                        &ldquo;{rel.note}&rdquo;
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      color:
                        tone === "pos"
                          ? "var(--color-pixel-success)"
                          : tone === "neg"
                            ? "var(--color-pixel-danger)"
                            : "var(--color-pixel-muted)",
                    }}
                  >
                    {rel.affection > 0 ? "+" : ""}
                    {rel.affection}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
