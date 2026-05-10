"use client";

import { type ReactNode, useState } from "react";
import type { Character, MapNode, Personality, WorldEvent } from "@/types/api.generated";
import { formatActionWindow, formatScheduledTime, vitalThreshold } from "@/lib/profile-format";
import { characterEmoji } from "@/lib/sprite";
import { indexNodes } from "@/lib/world";

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
      <span className="w-8 text-white/40">{label}</span>
      <div className="flex-1 h-2 bg-white/[0.06] border border-white/10 relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
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
      <span className="w-8 text-right text-white/80">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
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
      <span className="w-8 text-white/40">{label}</span>
      <div className="flex-1 h-2 bg-white/[0.06] border border-white/10 overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-white/80">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
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
    <div className="flex items-center gap-2 text-game-xs uppercase tracking-widest text-white/40 mb-1">
      <span>{children}</span>
      {showCount && (
        <span className="px-1 bg-white/[0.06] border border-white/10 text-game-2xs normal-case tracking-normal">
          {shown !== undefined ? `${shown}/${total}` : total}
        </span>
      )}
      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-(--accent-strong) hover:underline normal-case tracking-normal"
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
  epoch,
  currentTick: _currentTick,
}: {
  character: Character | null;
  nodes: MapNode[];
  onJumpToNode: (nodeId: string) => void;
  characters: Character[];
  events?: WorldEvent[];
  onFollow?: (id: string) => void;
  isFollowing?: boolean;
  epoch: number;
  currentTick: number;
}) {
  const characterId = character?.id;
  const [profileTab, setProfileTab] = useState<"profile" | "monologue" | "relations" | "history">("profile");
  const [thoughtExpanded, setThoughtExpanded] = useState(false);
  const [relationsExpanded, setRelationsExpanded] = useState(false);
  const [memoriesExpanded, setMemoriesExpanded] = useState(false);
  const [dailyExpanded, setDailyExpanded] = useState(false);
  const [longExpanded, setLongExpanded] = useState(false);
  const [impressionPopover, setImpressionPopover] = useState<{ targetId: string; x: number; y: number } | null>(null);
  const [notebookExpanded, setNotebookExpanded] = useState(false);
  const [lastCharacterId, setLastCharacterId] = useState(characterId);
  if (lastCharacterId !== characterId) {
    setLastCharacterId(characterId);
    setProfileTab("profile");
    setThoughtExpanded(false);
    setRelationsExpanded(false);
    setMemoriesExpanded(false);
    setDailyExpanded(false);
    setLongExpanded(false);
    setImpressionPopover(null);
    setNotebookExpanded(false);
  }

  if (!character) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-white/30 text-center max-w-xs leading-relaxed">
          点击左栏角色查看完整档案。
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
  const sortedNotebook = [...character.notebook].sort((a, b) => a.scheduledTick - b.scheduledTick);
  const totalNotebook = sortedNotebook.length;
  const visibleNotebook = notebookExpanded ? sortedNotebook : sortedNotebook.slice(0, 5);

  return (
    <div className="h-full flex flex-col">
      {/* Tab header + follow */}
      <div className="flex items-center border-b border-white/10 bg-white/[0.03] flex-shrink-0">
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
              className={`text-[10px] tracking-[0.1em] px-3 py-2 uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
                profileTab === key
                  ? "text-(--accent-strong) border-(--accent-strong)"
                  : "text-white/40 border-transparent hover:text-white/80"
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
            className={`mr-2 px-2 py-1 text-[10px] tracking-[0.1em] border border-white/10 rounded cursor-pointer ${
              isFollowing
                ? "bg-(--accent-strong)/10 text-(--accent-strong)"
                : "bg-transparent text-white/40 hover:text-white/80"
            }`}
          >
            {isFollowing ? "👁 已跟随" : "👁 跟随她"}
          </button>
        )}
      </div>

      {/* 档案 tab — all existing content */}
      {profileTab === "profile" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {/* 头部 */}
          <div className="flex items-start gap-3">
            <span className="text-[36px]">
              {characterEmoji(character)}
            </span>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="text-[15px] text-white/85">{character.name}</div>
              <div className="text-[11px] text-white/40">
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
              <div className="text-[11px] text-white/40">
                {APPEARANCE_LABELS[character.appearance] ?? "—"}
                {" · "}
                {INTELLIGENCE_LABELS[character.intelligence] ?? "—"}
                {" · "}
                {HEALTH_LABELS[character.health] ?? "—"}
                {character.sickness && (
                  <span className="text-(--danger)">
                    {" · "}🤒 生病
                  </span>
                )}
                {character.speakingStyle && (
                  <span className="text-(--accent-strong)">
                    {" · "}{character.speakingStyle}
                  </span>
                )}
              </div>
              <div className="text-[11px]">
                <button
                  type="button"
                  onClick={() => onJumpToNode(character.locationId)}
                  className="text-(--accent-strong) hover:underline"
                >
                  @ {here?.name ?? character.locationId} ↗
                </button>
                {character.activityNodeId && nodeById.get(character.activityNodeId) && (
                  <span className="text-white/40">
                    {" · 活动处 "}
                    <button
                      type="button"
                      onClick={() => onJumpToNode(character.activityNodeId!)}
                      className="text-(--accent-strong) hover:underline"
                    >
                      {nodeById.get(character.activityNodeId)?.name}
                    </button>
                  </span>
                )}
                {character.restNodeId
                  && character.restNodeId !== character.activityNodeId
                  && nodeById.get(character.restNodeId) && (
                    <span className="text-white/40">
                      {" · 休息处 "}
                      <button
                        type="button"
                        onClick={() => onJumpToNode(character.restNodeId!)}
                        className="text-(--accent-strong) hover:underline"
                      >
                        {nodeById.get(character.restNodeId)?.name}
                      </button>
                    </span>
                  )}
              </div>
              {character.currentAction && (
                <div>
                  <span className="inline-block px-1.5 text-game-xs bg-(--accent-strong)/10 text-(--accent-strong) rounded">
                    {formatActionWindow(character.currentAction)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 个人档案 */}
          {character.personalProfile && (character.personalProfile.past || character.personalProfile.present) && (
            <section className="border-2 border-white/10 bg-white/[0.06] p-2 space-y-2">
              <div className="text-game-xs uppercase tracking-widest text-white/40 mb-1">个人档案</div>
              {character.personalProfile.past && (
                <div>
                  <div className="text-game-xs text-white/40 mb-0.5">过往经历</div>
                  <p className="text-game-sm leading-relaxed text-white/80 italic">
                    &ldquo;{character.personalProfile.past}&rdquo;
                  </p>
                </div>
              )}
              {character.personalProfile.present && (
                <div>
                  <div className="text-game-xs text-white/40 mb-0.5">当前状况</div>
                  <p className="text-game-sm leading-relaxed text-white/80 italic">
                    &ldquo;{character.personalProfile.present}&rdquo;
                  </p>
                </div>
              )}
            </section>
          )}

          {/* 上一轮思考 */}
          <section className="border-2 border-white/10 bg-white/[0.06] p-2 space-y-1">
            <div className="flex items-center gap-2 text-game-xs uppercase tracking-widest text-(--accent-strong)">
              <span>上一轮思考</span>
              {lastThought && (
                <>
                  <span className="text-white/40">·</span>
                  <span className="text-white/40">t={lastThought.tick}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-white/40">{lastThought.action.type}</span>
                  <span
                    className={`ml-auto px-1 text-game-2xs rounded ${
                      lastThought.success
                        ? "bg-(--success)/30 text-(--success)"
                        : "bg-(--danger)/30 text-(--danger)"
                    }`}
                  >
                    {lastThought.success ? "OK" : "FAIL"}
                  </span>
                </>
              )}
            </div>
            {!lastThought ? (
              <p className="text-game-sm text-white/40">
                还没有过决策（推进 1 小时后再来看）。
              </p>
            ) : (
              <>
                {lastThought.action.emotionTag && (
                  <div className="inline-block text-game-xs px-1.5 bg-(--accent-strong)/10 text-(--accent-strong) rounded">
                    {lastThought.action.emotionTag}
                  </div>
                )}
                <div
                  className={`text-game-sm leading-relaxed text-white/80 whitespace-pre-wrap ${
                    thoughtExpanded ? "" : "line-clamp-4"
                  }`}
                >
                  {lastThought.action.reasoning}
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setThoughtExpanded((v) => !v)}
                    className="text-game-xs text-(--accent-strong) hover:underline"
                  >
                    {thoughtExpanded ? "收起 ▴" : "展开全文 ▾"}
                  </button>
                </div>
                {lastThought.action.freeText && (
                  <div className="text-game-sm text-white/40 italic border-t border-white/10 pt-1">
                    &ldquo;{lastThought.action.freeText}&rdquo;
                  </div>
                )}
              </>
            )}
          </section>

          {/* 备忘记事本 */}
          <section>
            <SectionLabel
              shown={Math.min(visibleNotebook.length, totalNotebook)}
              total={totalNotebook}
              expanded={notebookExpanded}
              onToggle={() => setNotebookExpanded((v) => !v)}
            >
              备忘记事本
            </SectionLabel>
            {totalNotebook === 0 ? (
              <p className="text-game-sm text-white/40">暂无记事</p>
            ) : (
              <ul className="space-y-1">
                {visibleNotebook.map((e) => (
                  <li key={e.id} className="text-game-sm text-white/80 leading-snug">
                    <span className="text-white/40">
                      {formatScheduledTime(e.scheduledTick, epoch)}
                    </span>
                    {" "}{e.content}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 状态仪表盘（hero） */}
          <section className="border border-(--accent-strong)/30 bg-white/[0.06] p-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-game-xs uppercase tracking-widest text-white/40 mb-1">
                  生理
                </div>
                <div className="space-y-0.5">
                  <UniBar label="饿" value={character.vitals.hunger} max={16} danger={10} warn={6} />
                  <UniBar label="累" value={character.vitals.fatigue} max={16} danger={10} warn={6} />
                  <UniBar label="脏" value={character.vitals.hygiene} max={16} danger={10} warn={6} />
                </div>
                {character.sleepWindow && (
                  <div className="text-game-xs text-white/40 mt-1">
                    🌙 {String(character.sleepWindow.start).padStart(2, "0")}:00 ~{" "}
                    {String((character.sleepWindow.start + character.sleepWindow.duration) % 24).padStart(2, "0")}:00
                  </div>
                )}
              </div>
              <div>
                <div className="text-game-xs uppercase tracking-widest text-white/40 mb-1">
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
            <div className="text-game-xs uppercase tracking-widest text-white/40 mb-1">
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
              <p className="text-game-sm text-white/40">尚无任何关系</p>
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
                          <button
                            type="button"
                            onClick={(e) => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setImpressionPopover({ targetId: id, x: rect.left, y: rect.bottom + 4 });
                            }}
                            className="text-white/80 hover:underline cursor-pointer"
                          >
                            {charById.get(id)?.name ?? id}
                          </button>
                          <span className="text-white/40 text-game-xs"> · {rel.kinds.join("/")}</span>
                        </div>
                        {imp && (
                          <div className="text-game-xs text-white/40 italic truncate">
                            &ldquo;{imp}&rdquo;
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          color:
                            impTone === "pos"
                              ? "var(--success)"
                              : impTone === "neg"
                                ? "var(--danger)"
                                : "var(--text-muted)",
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
              <p className="text-game-sm text-white/40">暂无记忆</p>
            ) : (
              <ul className="space-y-1">
                {visibleMemories.map((m) => (
                  <li key={m.id} className="text-game-sm text-white/80 leading-snug">
                    <span className="text-white/40">
                      t={m.tick}·<span className="text-(--accent-strong)">{"★".repeat(m.importance)}</span>
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
              <p className="text-game-sm text-white/40">暂无日记忆</p>
            ) : (
              <ul className="space-y-1">
                {visibleDaily.map((m) => (
                  <li key={m.id} className="text-game-sm text-white/80 leading-snug">
                    <span className="text-white/40">
                      t={m.tick}·<span className="text-(--accent-strong)">{"★".repeat(m.importance)}</span>
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
              <p className="text-game-sm text-white/40">暂无周记忆</p>
            ) : (
              <ul className="space-y-1">
                {visibleLong.map((m) => (
                  <li key={m.id} className="text-game-sm text-white/80 leading-snug">
                    <span className="text-white/40">
                      t={m.tick}·<span className="text-(--accent-strong)">{"★".repeat(m.importance)}</span>
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
              <p className="text-game-sm text-white/40">尚未习得任何能力</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {character.abilities.map((a, i) => (
                  <span
                    key={`${a.kind}-${i}`}
                    className="text-game-xs px-1 bg-white/[0.06] border border-white/10 text-white/80"
                  >
                    {a.kind} · <span className="text-(--accent-strong)">t{a.tier}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* 独白 tab */}
      {profileTab === "monologue" && (
        <div className="flex-1 overflow-y-auto p-4">
          {character?.lastThought?.action?.reasoning ? (
            <div>
              <div className="text-[10px] tracking-[0.1em] text-white/40 mb-2">最近思考</div>
              <div className="text-body-sm text-white/80 leading-[var(--lh-loose)]">
                {character.lastThought.action.reasoning}
              </div>
              {events && events.length > 0 && (
                <div className="mt-4">
                  <div className="text-[10px] tracking-[0.1em] text-white/40 mb-2">历史独白</div>
                  {events
                    .filter((ev) => ev.category === "inner" && ev.participants.includes(character.id))
                    .slice(0, 20)
                    .map((ev) => (
                      <div key={ev.id} className="mb-2 text-body-sm text-white/80 leading-[var(--lh-normal)] italic border-l-2 border-(--accent-strong)/30 pl-3">
                        &ldquo;{ev.description}&rdquo;
                        <div className="text-[10px] text-white/25 mt-0.5">
                          T={ev.tick}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-body-sm text-white/40 text-center mt-10">暂无独白记录</p>
          )}
        </div>
      )}

      {/* 关系 tab */}
      {profileTab === "relations" && (
        <div className="flex-1 overflow-y-auto p-4">
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
                const toneColor = impTone === "pos" ? "var(--success)" : impTone === "neg" ? "var(--danger)" : "var(--text-muted)";
                return (
                  <li key={targetId} className="text-body-sm text-white/80 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setImpressionPopover({ targetId, x: rect.left, y: rect.bottom + 4 });
                      }}
                      className="hover:underline cursor-pointer"
                      style={{ color: toneColor }}
                    >
                      {other?.name ?? targetId}
                    </button>
                    <span className="text-[10px] text-white/40">
                      {rel.kinds.join("/")}
                    </span>
                    {imp && (
                      <span className="text-body-xs text-white/25 italic">
                        — {imp}
                      </span>
                    )}
                    <span className="ml-auto text-[10px]" style={{ color: toneColor }}>
                      {imp ? imp.slice(0, 8) + (imp.length > 8 ? "..." : "") : rel.kinds.join("/")}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body-sm text-white/40 text-center mt-10">暂无关系</p>
          )}
        </div>
      )}

      {/* 经历 tab */}
      {profileTab === "history" && (
        <div className="flex-1 overflow-y-auto p-4">
          {character && events ? (
            (() => {
              const charEvents = events.filter((ev) => ev.participants.includes(character.id));
              return charEvents.length > 0 ? (
                <div className="space-y-3">
                  {charEvents.slice(0, 30).map((ev) => (
                    <div key={ev.id} className="text-body-sm text-white/80 leading-[var(--lh-normal)]">
                      <span className="text-[10px] text-white/25 mr-2">
                        T={ev.tick}
                      </span>
                      {ev.description}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-body-sm text-white/40 text-center mt-10">暂无经历</p>
              );
            })()
          ) : (
            <p className="text-body-sm text-white/40 text-center mt-10">选择角色以查看经历</p>
          )}
        </div>
      )}

      {/* Impression popover */}
      {impressionPopover && (() => {
        const targetId = impressionPopover.targetId;
        const targetChar = charById.get(targetId);
        const impText = character.impressionBook[targetId];
        return (
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setImpressionPopover(null)}>
            <div
              className="absolute bg-black/70 backdrop-blur-xl border border-white/10 rounded p-3 max-w-[320px] shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
              style={{
                left: impressionPopover.x,
                top: impressionPopover.y,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">
                  {characterEmoji(targetChar ?? { id: targetId })}
                </span>
                <span className="text-game-sm font-semibold text-white/80">
                  {targetChar?.name ?? targetId} 的印象
                </span>
                <button
                  type="button"
                  onClick={() => setImpressionPopover(null)}
                  className="ml-auto text-white/40 hover:text-white/70 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              {impText ? (
                <p className="text-game-sm text-white/60 italic leading-relaxed">
                  &ldquo;{impText}&rdquo;
                </p>
              ) : (
                <p className="text-game-sm text-white/40">
                  暂无印象记录。
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
