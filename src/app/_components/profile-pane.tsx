"use client";

import { type ReactNode, useState } from "react";
import type { Character, MapNode, Personality, WorldEvent } from "@/domain/types";
import { formatActionWindow, vitalThreshold } from "../_lib/profile-format";
import { characterEmoji } from "../_lib/sprite";
import { indexNodes } from "../_lib/world";

const PERSONALITY_LABELS: Record<keyof Personality, string> = {
  ei: "I/E",
  sn: "N/S",
  tf: "F/T",
  jp: "P/J",
};

const PROFESSION_LABELS: Record<string, string> = {
  farmer: "农民", rancher: "牧场主", fisherman: "渔夫", lumberjack: "伐木工", hunter: "猎人",
  chef: "厨师", baker: "面包师", brewer: "酿酒师",
  blacksmith: "铁匠", carpenter: "木匠", tailor: "裁缝",
  merchant: "商人", grocer: "杂货店主", innkeeper: "旅店老板",
  doctor: "医生", nurse: "护士", teacher: "教师", librarian: "图书管理员",
  priest: "神官", mailman: "邮递员", mayor: "镇长官", student: "学生", unemployed: "无业",
};

const APPEARANCE_LABELS: Record<number, string> = {
  1: "面容平凡",
  2: "长相普通",
  3: "相貌端正",
  4: "面容出众",
};

const INTELLIGENCE_LABELS: Record<number, string> = {
  1: "迟钝",
  2: "直率",
  3: "机敏",
  4: "聪慧",
};

const HEALTH_LABELS: Record<number, string> = {
  1: "体弱",
  2: "普通",
  3: "健壮",
  4: "强韧",
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
      <span className="w-8 text-right text-(--color-pixel-fg)">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
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
      <span className="w-8 text-right text-(--color-pixel-fg)">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
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
  events,
  onFollow,
  isFollowing,
}: {
  character: Character | null;
  nodes: MapNode[];
  onJumpToNode: (nodeId: string) => void;
  characters: Character[];
  events?: WorldEvent[];
  onFollow?: (id: string) => void;
  isFollowing?: boolean;
}) {
  const characterId = character?.id;
  const [profileTab, setProfileTab] = useState<"profile" | "monologue" | "relations" | "history">("profile");
  const [thoughtExpanded, setThoughtExpanded] = useState(false);
  const [relationsExpanded, setRelationsExpanded] = useState(false);
  const [memoriesExpanded, setMemoriesExpanded] = useState(false);
  const [dailyExpanded, setDailyExpanded] = useState(false);
  const [longExpanded, setLongExpanded] = useState(false);
  const [lastCharacterId, setLastCharacterId] = useState(characterId);
  if (lastCharacterId !== characterId) {
    setLastCharacterId(characterId);
    setProfileTab("profile");
    setThoughtExpanded(false);
    setRelationsExpanded(false);
    setMemoriesExpanded(false);
    setDailyExpanded(false);
    setLongExpanded(false);
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
  const sortedMemories = [...character.shortMemory].sort((a, b) => b.tick - a.tick);
  const totalMemories = sortedMemories.length;
  const visibleMemories = memoriesExpanded ? sortedMemories : sortedMemories.slice(0, 5);
  const sortedDaily = [...character.dailyMemory].sort((a, b) => b.tick - a.tick);
  const totalDaily = sortedDaily.length;
  const visibleDaily = dailyExpanded ? sortedDaily : sortedDaily.slice(0, 5);
  const sortedLong = [...character.longMemory].sort((a, b) => b.tick - a.tick);
  const totalLong = sortedLong.length;
  const visibleLong = longExpanded ? sortedLong : sortedLong.slice(0, 5);
  const sortedRelations = Object.entries(character.relations).sort(
    (a, b) => {
      const aImp = character.impressionBook[a[0]] ? 1 : 0;
      const bImp = character.impressionBook[b[0]] ? 1 : 0;
      if (aImp !== bImp) return bImp - aImp;
      return b[1].since - a[1].since;
    },
  );
  const totalRelations = sortedRelations.length;
  const visibleRelations = relationsExpanded ? sortedRelations : sortedRelations.slice(0, 5);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Tab header + follow */}
      <div className="flex items-center border-b border-(--border) bg-(--chrome)">
        <div className="flex">
          {([
            ["profile", "档案"],
            ["monologue", "独白"],
            ["relations", "关系"],
            ["history", "经历"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setProfileTab(key)}
              className={`text-pixel-xs px-3 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
                profileTab === key
                  ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
                  : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {onFollow && character && (
          <button
            type="button"
            onClick={() => onFollow(character.id)}
            className={`mr-2 px-2 py-1 text-pixel-xs border border-(--border-amber) cursor-pointer tracking-[var(--letter-pixel-tight)] ${
              isFollowing
                ? "bg-(--border-amber) text-(--panel)"
                : "bg-transparent text-(--text-on-frame-muted) hover:text-(--text-on-frame)"
            }`}
          >
            {isFollowing ? "👁 已跟随" : "👁 跟随她"}
          </button>
        )}
      </div>

      {/* 档案 tab — all existing content */}
      {profileTab === "profile" && (
        <div className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-3 space-y-3">
          {/* 头部 */}
          <div className="flex items-start gap-3">
            <span className="npc-chip npc-chip--lg npc-chip--selected pixelated" style={{ fontSize: "36px", width: "60px", height: "60px" }}>
              {characterEmoji(character)}
            </span>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="text-game-lg text-(--color-pixel-fg)">{character.name}</div>
              <div className="text-game-sm text-(--color-pixel-muted)">
                {PROFESSION_LABELS[character.profession] ?? character.profession}
                {" · "}
                {character.age} 岁
                {" · "}
                {character.gender === "male" ? "男" : character.gender === "female" ? "女" : "其他"}
                {" · "}
                {character.origin === "local" ? "本地" : "外来者"}
                {" · "}
                💰 {character.money}
              </div>
              <div className="text-game-sm text-(--color-pixel-muted)">
                {APPEARANCE_LABELS[character.appearance] ?? "—"}
                {" · "}
                {INTELLIGENCE_LABELS[character.intelligence] ?? "—"}
                {" · "}
                {HEALTH_LABELS[character.health] ?? "—"}
                {character.sickness && (
                  <span className="text-(--color-pixel-danger)">
                    {" · "}🤒 生病
                  </span>
                )}
                {character.speakingStyle && (
                  <span className="text-(--color-pixel-accent)">
                    {" · "}{character.speakingStyle}
                  </span>
                )}
              </div>
              <div className="text-game-sm">
                <button
                  type="button"
                  onClick={() => onJumpToNode(character.locationId)}
                  className="text-(--color-pixel-accent) hover:underline"
                >
                  @ {here?.name ?? character.locationId} ↗
                </button>
                {character.activityNodeId && nodeById.get(character.activityNodeId) && (
                  <span className="text-(--color-pixel-muted)">
                    {" · 活动处 "}
                    <button
                      type="button"
                      onClick={() => onJumpToNode(character.activityNodeId!)}
                      className="text-(--color-pixel-accent) hover:underline"
                    >
                      {nodeById.get(character.activityNodeId)?.name}
                    </button>
                  </span>
                )}
                {character.restNodeId
                  && character.restNodeId !== character.activityNodeId
                  && nodeById.get(character.restNodeId) && (
                    <span className="text-(--color-pixel-muted)">
                      {" · 休息处 "}
                      <button
                        type="button"
                        onClick={() => onJumpToNode(character.restNodeId!)}
                        className="text-(--color-pixel-accent) hover:underline"
                      >
                        {nodeById.get(character.restNodeId)?.name}
                      </button>
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

          {/* 生平简介 */}
          {character.biography && (
            <section className="border-2 border-(--color-pixel-border-dark) bg-(--color-pixel-bg-2) p-2">
              <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">生平</div>
              <p className="text-game-sm leading-relaxed text-(--color-pixel-fg) italic">
                &ldquo;{character.biography}&rdquo;
              </p>
            </section>
          )}

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
                {character.sleepWindow && (
                  <div className="text-game-xs text-(--color-pixel-muted) mt-1">
                    🌙 {String(character.sleepWindow.start).padStart(2, "0")}:00 ~{" "}
                    {String((character.sleepWindow.start + character.sleepWindow.duration) % 24).padStart(2, "0")}:00
                  </div>
                )}
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
                  const imp = character.impressionBook[id];
                  const impTone = imp
                    ? /喜欢|欣赏|信任|尊敬|爱|友好|亲切|可靠|感激|温暖|帮助/.test(imp)
                      ? "pos"
                      : /讨厌|厌恶|恨|不信任|害怕|恐惧|嫌弃|虚伪|自私|冷漠|刻薄|狡猾/.test(imp)
                        ? "neg"
                        : "zero"
                    : "zero";
                  return (
                    <li key={id} className="text-game-sm grid grid-cols-[18px_1fr_auto] gap-2 items-baseline">
                      <span className="text-base">
                        {characterEmoji(charById.get(id) ?? { id })}
                      </span>
                      <div className="min-w-0">
                        <div>
                          <span className="text-(--color-pixel-fg)">
                            {charById.get(id)?.name ?? id}
                          </span>
                          <span className="text-(--color-pixel-muted) text-game-xs"> · {rel.kinds.join("/")}</span>
                        </div>
                        {imp && (
                          <div className="text-game-xs text-(--color-pixel-muted) italic truncate">
                            &ldquo;{imp}&rdquo;
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          color:
                            impTone === "pos"
                              ? "var(--color-pixel-success)"
                              : impTone === "neg"
                                ? "var(--color-pixel-danger)"
                                : "var(--color-pixel-muted)",
                        }}
                      >
                        {imp ? imp.slice(0, 8) + (imp.length > 8 ? "…" : "") : rel.kinds.join("/")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 最近记忆 */}
          <section>
            <SectionLabel
              shown={Math.min(visibleMemories.length, totalMemories)}
              total={totalMemories}
              expanded={memoriesExpanded}
              onToggle={() => setMemoriesExpanded((v) => !v)}
            >
              最近记忆
            </SectionLabel>
            {totalMemories === 0 ? (
              <p className="text-game-sm text-(--color-pixel-muted)">暂无记忆</p>
            ) : (
              <ul className="space-y-1">
                {visibleMemories.map((m) => (
                  <li key={m.id} className="text-game-sm text-(--color-pixel-fg) leading-snug">
                    <span className="text-(--color-pixel-muted)">
                      t={m.tick}·<span className="text-(--color-pixel-accent)">{"★".repeat(m.importance)}</span>
                    </span>{" "}
                    {m.content}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 日记忆 */}
          <section>
            <SectionLabel
              shown={Math.min(visibleDaily.length, totalDaily)}
              total={totalDaily}
              expanded={dailyExpanded}
              onToggle={() => setDailyExpanded((v) => !v)}
            >
              日记忆
            </SectionLabel>
            {totalDaily === 0 ? (
              <p className="text-game-sm text-(--color-pixel-muted)">暂无日记忆</p>
            ) : (
              <ul className="space-y-1">
                {visibleDaily.map((m) => (
                  <li key={m.id} className="text-game-sm text-(--color-pixel-fg) leading-snug">
                    <span className="text-(--color-pixel-muted)">
                      t={m.tick}·<span className="text-(--color-pixel-accent)">{"★".repeat(m.importance)}</span>
                    </span>{" "}
                    {m.content}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 周记忆 */}
          <section>
            <SectionLabel
              shown={Math.min(visibleLong.length, totalLong)}
              total={totalLong}
              expanded={longExpanded}
              onToggle={() => setLongExpanded((v) => !v)}
            >
              周记忆
            </SectionLabel>
            {totalLong === 0 ? (
              <p className="text-game-sm text-(--color-pixel-muted)">暂无周记忆</p>
            ) : (
              <ul className="space-y-1">
                {visibleLong.map((m) => (
                  <li key={m.id} className="text-game-sm text-(--color-pixel-fg) leading-snug">
                    <span className="text-(--color-pixel-muted)">
                      t={m.tick}·<span className="text-(--color-pixel-accent)">{"★".repeat(m.importance)}</span>
                    </span>{" "}
                    {m.content}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 能力 */}
          <section>
            <SectionLabel total={character.abilities.length}>能力</SectionLabel>
            {character.abilities.length === 0 ? (
              <p className="text-game-sm text-(--color-pixel-muted)">尚未习得任何能力</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {character.abilities.map((a, i) => (
                  <span
                    key={`${a.kind}-${i}`}
                    className="text-game-xs px-1 bg-(--color-pixel-bg-2) border border-(--color-pixel-border-dark) text-(--color-pixel-fg)"
                  >
                    {a.kind} · <span className="text-(--color-pixel-accent)">t{a.tier}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 独白 tab */}
      {profileTab === "monologue" && (
        <div className="flex-1 overflow-y-auto pixel-scroll p-4">
          {character?.lastThought?.action?.reasoning ? (
            <div>
              <div className="text-pixel-xs text-(--text-on-frame-muted) tracking-[var(--letter-pixel)] mb-2">最近思考</div>
              <div className="text-body-sm text-(--text-on-frame) leading-[var(--lh-loose)]">
                {character.lastThought.action.reasoning}
              </div>
              {events && events.length > 0 && (
                <div className="mt-4">
                  <div className="text-pixel-xs text-(--text-on-frame-muted) tracking-[var(--letter-pixel)] mb-2">历史独白</div>
                  {events
                    .filter((ev) => ev.category === "inner" && ev.participants.includes(character.id))
                    .slice(0, 20)
                    .map((ev) => (
                      <div key={ev.id} className="mb-2 text-body-sm text-(--text-on-frame) leading-[var(--lh-normal)] italic border-l-2 border-(--border-amber) pl-3">
                        &ldquo;{ev.description}&rdquo;
                        <div className="text-pixel-xs text-(--text-on-frame-faint) mt-0.5">
                          T={ev.tick}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">暂无独白记录</p>
          )}
        </div>
      )}

      {/* 关系 tab */}
      {profileTab === "relations" && (
        <div className="flex-1 overflow-y-auto pixel-scroll p-4">
          {character && character.relations && Object.keys(character.relations).length > 0 ? (
            <ul className="space-y-2">
              {Object.entries(character.relations).map(([targetId, rel]) => {
                const other = characters.find((c) => c.id === targetId);
                const imp = character.impressionBook[targetId];
                const impTone = imp
                  ? /喜欢|欣赏|信任|尊敬|爱|友好|亲切|可靠|感激|温暖|帮助/.test(imp)
                    ? "pos"
                    : /讨厌|厌恶|恨|不信任|害怕|恐惧|嫌弃|虚伪|自私|冷漠|刻薄|狡猾/.test(imp)
                      ? "neg"
                      : "zero"
                  : "zero";
                return (
                  <li key={targetId} className="text-body-sm text-(--text-on-frame) flex items-center gap-2">
                    <span className="text-pixel-xs" style={{ color: impTone === "pos" ? "var(--color-pixel-success)" : impTone === "neg" ? "var(--color-pixel-danger)" : "var(--color-pixel-muted)" }}>
                      {other?.name ?? targetId}
                    </span>
                    <span className="text-pixel-xs text-(--text-on-frame-muted)">
                      {rel.kinds.join("/")}
                    </span>
                    {imp && (
                      <span className="text-body-xs text-(--text-on-frame-faint) italic">
                        — {imp}
                      </span>
                    )}
                    <span className="ml-auto text-pixel-xs" style={{
                      color: impTone === "pos" ? "var(--color-pixel-success)" : impTone === "neg" ? "var(--color-pixel-danger)" : "var(--color-pixel-muted)",
                    }}>
                      {imp ? imp.slice(0, 8) + (imp.length > 8 ? "..." : "") : rel.kinds.join("/")}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">暂无关系</p>
          )}
        </div>
      )}

      {/* 经历 tab */}
      {profileTab === "history" && (
        <div className="flex-1 overflow-y-auto pixel-scroll p-4">
          {character && events ? (
            (() => {
              const charEvents = events.filter((ev) => ev.participants.includes(character.id));
              return charEvents.length > 0 ? (
                <div className="space-y-3">
                  {charEvents.slice(0, 30).map((ev) => (
                    <div key={ev.id} className="text-body-sm text-(--text-on-frame) leading-[var(--lh-normal)]">
                      <span className="text-pixel-xs text-(--text-on-frame-faint) mr-2">
                        T={ev.tick}
                      </span>
                      {ev.description}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">暂无经历</p>
              );
            })()
          ) : (
            <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">选择角色以查看经历</p>
          )}
        </div>
      )}
    </div>
  );
}
