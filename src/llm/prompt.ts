/**
 * Prompt 构造（v0.2 反"通宵扎堆"局部最优）。
 *
 * 拆分原则（为 Stage 2 prompt-cache 做准备）：
 * - system: 几乎不变 / 慢变 → 世界规则 + 角色画像（含昼夜节律、生理优先级、反循环规则）
 * - user: 每次新输入 → 时间 + 自我观察聚合 + 当前位置 + 同节点 NPC + 触发事件 +
 *         可选行动 + 近期短期记忆
 *
 * 自我观察聚合（"你的连续行为"段）来自 src/engine/facts.ts 的 AggregatedFacts，
 * 由 tick 主循环从 agent_thoughts 推导出来再注入。Stage 1 不打 cache_control。
 */
import type { ActionType } from "@/domain/enums";
import type { AggregatedFacts } from "@/engine/facts";
import type {
  Character,
  MapNode,
  Memory,
  Personality,
  WorldEvent,
} from "@/domain/types";
import type { ActionOption } from "@/engine/actions";

const RECENT_MEMORY_LIMIT = 8;

const PERSONALITY_NAMES: Record<keyof Personality, string> = {
  extraversion: "外向性",
  rationality: "理性",
  ambition: "进取心",
  altruism: "利他",
  curiosity: "好奇心",
  aggression: "攻击性",
  honesty: "诚实",
  stability: "情绪稳定",
};

const ACTION_NAMES: Partial<Record<ActionType, string>> = {
  move: "移动",
  wait: "等待",
  observe: "观察",
  speak: "说话",
  interact_object: "互动物体",
  interact_person: "互动对人",
  use_ability: "用能力",
  rest: "休息",
  work: "工作/学习",
  eat: "进食",
  attack: "攻击",
  flee: "逃避",
  help: "帮助",
  gift: "馈赠",
  read: "阅读",
};

function describePersonality(p: Personality): string[] {
  return (Object.keys(PERSONALITY_NAMES) as (keyof Personality)[])
    .map((k) => `${PERSONALITY_NAMES[k]} = ${formatScalar(p[k])}`);
}

function formatScalar(v: number): string {
  return v >= 0 ? `+${v}` : `${v}`;
}

function describeRelations(c: Character, peers: Character[]): string {
  if (peers.length === 0) return "（同节点没有其他人）";
  return peers
    .map((p) => {
      const r = c.relations[p.id];
      const tag = r ? `${r.kind}, 好感 ${formatScalar(r.affinity)}` : "陌生人";
      return `- ${p.name}（${tag}）${r?.note ? `——${r.note}` : ""}`;
    })
    .join("\n");
}

function describeMemories(memories: Memory[]): string {
  const recent = memories.slice(-RECENT_MEMORY_LIMIT);
  if (recent.length === 0) return "（暂无记忆）";
  return recent.map((m) => `- t=${m.tick}: ${m.content}`).join("\n");
}

function describeEvents(events: WorldEvent[]): string {
  if (events.length === 0)
    return "（本时刻没有特别的事件，凭你的性格和当前状态决定要做什么）";
  return events
    .map(
      (e) =>
        `- [${e.category}, 强度 ${e.intensity}] ${e.description}`,
    )
    .join("\n");
}

function describeOptions(opts: ActionOption[]): string {
  return opts
    .map((o, i) => {
      const meta: string[] = [`type=${o.type}`];
      if (o.targetId) meta.push(`target_id=${o.targetId}`);
      if (o.targetNodeId) meta.push(`target_node_id=${o.targetNodeId}`);
      return `${i + 1}. (${meta.join(", ")}) ${o.hint}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// helper：vitals 6 档定性 + 紧迫度（替代裸数字）
// ---------------------------------------------------------------------------

export type VitalUrgency =
  | "none"
  | "mild"
  | "moderate"
  | "high"
  | "critical"
  | "fatal";

export function qualifyVital(
  value: number,
  kind: "hunger" | "fatigue",
): { phrase: string; urgency: VitalUrgency } {
  if (kind === "hunger") {
    if (value <= 0) return { phrase: "不饿", urgency: "none" };
    if (value < 5)
      return {
        phrase: `略有饥饿感（${value} 小时未进食）`,
        urgency: "mild",
      };
    if (value < 10)
      return {
        phrase: `明显饥饿（${value} 小时未进食）`,
        urgency: "moderate",
      };
    if (value < 15)
      return {
        phrase: `肚子很难受（${value} 小时未进食），注意力开始分散`,
        urgency: "high",
      };
    if (value < 25)
      return {
        phrase: `极度饥饿（${value} 小时未进食），头晕眼花`,
        urgency: "critical",
      };
    return {
      phrase: `濒临饿坏（${value} 小时未进食），必须立刻进食`,
      urgency: "fatal",
    };
  }
  // fatigue
  if (value <= 0) return { phrase: "精神饱满", urgency: "none" };
  if (value < 5)
    return {
      phrase: `略感疲倦（清醒了 ${value} 小时）`,
      urgency: "mild",
    };
  if (value < 10)
    return {
      phrase: `明显疲惫（连续 ${value} 小时未休息）`,
      urgency: "moderate",
    };
  if (value < 15)
    return {
      phrase: `困倦（连续 ${value} 小时未休息），眼皮在打架`,
      urgency: "high",
    };
  if (value < 25)
    return {
      phrase: `极度疲惫（连续 ${value} 小时未休息），几乎站着都能睡着`,
      urgency: "critical",
    };
  return {
    phrase: `濒临崩溃（连续 ${value} 小时未休息），必须立刻 rest`,
    urgency: "fatal",
  };
}

// ---------------------------------------------------------------------------
// helper：tick → 时段标签
// ---------------------------------------------------------------------------

export type DayPeriod =
  | "深夜"
  | "凌晨"
  | "早晨"
  | "上午"
  | "中午"
  | "下午"
  | "傍晚"
  | "夜晚";

export function timeOfDay(tick: number): {
  hour: number;
  day: number;
  period: DayPeriod;
  isSleepHour: boolean;
} {
  const day = Math.floor(tick / 24);
  const hour = ((tick % 24) + 24) % 24;
  let period: DayPeriod;
  if (hour < 5) period = "深夜";
  else if (hour < 7) period = "凌晨";
  else if (hour < 9) period = "早晨";
  else if (hour < 12) period = "上午";
  else if (hour < 14) period = "中午";
  else if (hour < 17) period = "下午";
  else if (hour < 20) period = "傍晚";
  else period = "夜晚";
  const isSleepHour = hour < 6 || hour >= 22;
  return { hour, day, period, isSleepHour };
}

// ---------------------------------------------------------------------------
// helper：把 todayActionCounts 渲染为人类可读串
// ---------------------------------------------------------------------------

function formatActionCounts(
  counts: Partial<Record<ActionType, number>>,
): string {
  const entries = (Object.entries(counts) as Array<[ActionType, number]>)
    .filter(([, n]) => n && n > 0)
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return "（暂无）";
  return entries.map(([k, v]) => `${ACTION_NAMES[k] ?? k} ×${v}`).join("、");
}

// ---------------------------------------------------------------------------
// system prompt
// ---------------------------------------------------------------------------

const WORLD_RULES = `你是 LLM-as-NPC 模拟世界中的一个角色。这是一个由"导演型玩家"在外部观察、并偶尔向某地点投放事件的虚拟小镇。

游戏时间：1 tick = 1 个游戏小时。你不需要思考"玩家"——你只在你的角色身份下做出与你性格相符的决定。

行动机制：
- 你**只能**通过调用 submit_action 工具来回复，禁止直接输出任何自然语言文本——直接吐文本视为本 tick 弃权。
- 你必须从封闭的 ActionType 集合中选一个 type，作为 submit_action 的参数。
- 你可以在 free_text 中加入说话内容或行动具体描述。
- reasoning 是你的内心独白，必须在其中显式引用至少一项你自己的性格维度数值（例如："我的攻击性 +70 让我对此挑衅没法忍"）。这是硬性规则。
- self_importance 1-5，决定这件事是否进入你的长期记忆。
- 不要做超出当前可选行动列表的事；如果列表里没合适的，选 wait 或 observe。

昼夜节律：
- 1 日 = 24 tick。00:00–06:00 是深夜与凌晨；06:00–09:00 起床用餐；09:00–18:00 日常活动；18:00–22:00 用餐与社交；22:00–24:00 准备回家。
- 绝大多数人在 22:00–06:00 应在自己的住所睡觉。除非有强烈理由（紧急事件、夜班、关键人际冲突），夜间继续在公共场所社交是反常的，必须在 reasoning 里明确解释为何打破作息。

生理优先级：
- 当疲惫进入"困倦"以上（连续未眠 ≥10 小时），rest 优先于一切社交；当前位置不能 rest（非 residence/private）时，首选 move 回自己的家。
- 当饥饿进入"很难受"以上（≥10 小时未进食），eat 同样优先于社交；当前位置不能 eat 时首选 move 去用餐场所。
- 性格维度仍主导**怎么做**（爱独处 / 爱热闹 / 易怒 / 稳重），但**做不做基本生理维护**不应被性格压制。

反循环：
- 若你过去几个 tick 已多次做同一类行动且情境无新变化（例如连续 4 个 tick 都在 speak），应主动切换行为，否则视为思考懒惰。
- 若你已在同一节点超过 8 小时，且这里不是你的家、工作场所或庆典现场，应认真考虑 move 去别处。`;

export function buildSystemPrompt(args: {
  character: Character;
  worldName: string;
}): string {
  const { character, worldName } = args;
  return [
    WORLD_RULES,
    "",
    `你身处的世界：${worldName}。`,
    "",
    "你的自我认知：",
    `- 名字：${character.name}`,
    "- 性格维度（每项 [-100, 100]，越极端越要在 reasoning 中引用）：",
    ...describePersonality(character.personality).map((s) => `  · ${s}`),
    character.abilities.length > 0
      ? `- 能力：${character.abilities.map((a) => `${a.kind}(tier ${a.tier})`).join("、")}`
      : "- 能力：（无值得一提的特殊能力）",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// user prompt
// ---------------------------------------------------------------------------

function describeContinuity(
  facts: AggregatedFacts,
  hereName: string,
  currentTick: number,
): string {
  const lines: string[] = [];
  lines.push(`- 已在 ${hereName} 连续 ${facts.hoursAtCurrentLocation} 小时`);

  if (facts.lastAction) {
    const { type, freeText, success } = facts.lastAction;
    const verb = ACTION_NAMES[type] ?? type;
    const ok = success ? "" : "（未成功）";
    const detail = freeText ? `："${freeText.slice(0, 40)}"` : "";
    lines.push(`- 上一 tick 你的行动：${verb}${ok}${detail}`);
  } else {
    lines.push("- 上一 tick：（无历史，世界刚开始）");
  }

  lines.push(
    facts.lastRestTick === undefined
      ? "- 距上次 rest：从未休息过"
      : `- 距上次 rest：${currentTick - facts.lastRestTick} 小时`,
  );
  lines.push(
    facts.lastEatTick === undefined
      ? "- 距上次 eat：从未进食过"
      : `- 距上次 eat：${currentTick - facts.lastEatTick} 小时`,
  );

  lines.push(`- 今日累计：${formatActionCounts(facts.todayActionCounts)}`);

  return lines.join("\n");
}

function hereCanRest(here: MapNode): boolean {
  return here.tags.includes("residence") || here.privacy === "private";
}

function hereCanEat(here: MapNode): boolean {
  return here.tags.includes("dining");
}

export function buildUserPrompt(args: {
  character: Character;
  here: MapNode;
  companions: Character[];
  perceived: WorldEvent[];
  options: ActionOption[];
  tick: number;
  facts: AggregatedFacts;
}): string {
  const { character, here, companions, perceived, options, tick, facts } = args;
  const t = timeOfDay(tick);
  const fatigue = qualifyVital(character.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(character.vitals.hunger, "hunger");

  const lines: string[] = [];

  // 1. 时间 + 作息引导
  lines.push(
    `当前时间：第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:00（${t.period}${t.isSleepHour ? "，绝大多数人此时应在睡觉" : ""}）。`,
  );
  if (facts.homeNodeName) {
    lines.push(
      `你的常规作息：22:00–06:00 在 ${facts.homeNodeName} 休息。`,
    );
  } else {
    lines.push("你的常规作息：（未设定固定住所）");
  }
  lines.push("");

  // 2. 你的连续行为
  lines.push("你的连续行为：");
  lines.push(describeContinuity(facts, here.name, tick));
  lines.push("");

  // 3. 当前位置
  lines.push(
    `你现在的位置：${here.name}（${here.privacy}, ${here.tags.join("/") || "无标签"}）`,
  );
  lines.push(`位置描述：${here.description || "（无）"}`);
  lines.push("");

  // 4. 状态（定性）
  lines.push("你当前的状态：");
  lines.push(`- 饥饿：${hunger.phrase}`);
  lines.push(`- 疲惫：${fatigue.phrase}`);
  if (character.statuses.length > 0) {
    lines.push(
      `- 离散标签：${character.statuses.map((s) => `${s.kind}(${s.level})`).join("、")}`,
    );
  } else {
    lines.push("- 离散标签：（无）");
  }

  // 4.1 紧迫提醒
  const fatigueUrgent =
    fatigue.urgency === "high" ||
    fatigue.urgency === "critical" ||
    fatigue.urgency === "fatal";
  const hungerUrgent =
    hunger.urgency === "high" ||
    hunger.urgency === "critical" ||
    hunger.urgency === "fatal";
  if (fatigueUrgent && !hereCanRest(here)) {
    lines.push(
      `⚠ 你过度疲惫但当前位置不能休息${
        facts.homeNodeName ? `，应优先 move 回 ${facts.homeNodeName}` : "，应优先 move 回有床的住所"
      }。`,
    );
  }
  if (hungerUrgent && !hereCanEat(here)) {
    lines.push("⚠ 你过度饥饿但当前位置不能进食，应优先 move 去用餐场所。");
  }
  lines.push("");

  // 5. 同节点其他人物
  lines.push("同节点其他人物：");
  lines.push(describeRelations(character, companions));
  lines.push("");

  // 6. 感知事件
  lines.push("你刚刚感知到的事件：");
  lines.push(describeEvents(perceived));
  lines.push("");

  // 7. 短期记忆
  lines.push("你的近期短期记忆：");
  lines.push(describeMemories(character.shortMemory));
  lines.push("");

  // 8. 可选行动
  lines.push("你现在可以选择的行动（每项已带类型与必要的 target id）：");
  lines.push(describeOptions(options));
  lines.push("");

  lines.push(
    "请**调用 submit_action 工具**返回你的决定（不要输出自然语言文本）。务必在 reasoning 中显式引用一项你的性格维度数值。",
  );

  return lines.join("\n");
}
