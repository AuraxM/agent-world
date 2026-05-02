/**
 * Prompt 构造（v2 — 角色系统重设计后）。
 *
 * 拆分原则（为 Stage 2 prompt-cache 做准备）：
 * - system: 几乎不变 / 慢变 → 世界规则 + 角色画像（MBTI 文本描述、生理优先级、反循环规则）
 * - user: 每次新输入 → 时间 + 自我观察聚合 + 当前位置 + 同节点 NPC（按优先级取 5）+
 *         触发事件 + 可选行动 + 近期短期记忆
 *
 * 关键约束：
 * - reasoning 必须显式引用一项性格特征的**文字描述**，禁止数值。
 * - vitals + emotion 全部以定性文字呈现给 LLM；prompt 不暴露任何 [-4,4] 的内部数字。
 */
import type { ActionType } from "@/domain/enums";
import { BLOOD_RELATION_KINDS } from "@/domain/enums";
import type { AggregatedFacts } from "@/engine/facts";
import type {
  Character,
  Emotion,
  MapNode,
  Memory,
  Personality,
  SleepWindow,
  Tick,
  WorldEvent,
} from "@/domain/types";
import type { ActionOption } from "@/engine/actions";
import type { Language } from "@/engine/settings";

const RECENT_MEMORY_LIMIT = 8;
const MAX_PEERS_IN_PROMPT = 5;
/** 14 游戏日 = 14 * 24 = 336 tick；与 tick.ts 保持同步。 */
const ACQUAINTANCE_DECAY_TICKS = 336;
/** acquaintance 距衰减还剩 ≤ 此 tick 数时，prompt 给出"濒临淡出"提示。 */
const ACQUAINTANCE_WARN_TICKS = 48;

// ---------------------------------------------------------------------------
// MBTI 9 档文字标签（无数值暴露）
// ---------------------------------------------------------------------------

const EI_LABELS: Record<number, string> = {
  [-4]: "极度内向，只想独处",
  [-3]: "非常内向",
  [-2]: "偏内向",
  [-1]: "略偏内向",
  [0]: "内外平衡",
  [1]: "略偏外向",
  [2]: "偏外向",
  [3]: "非常外向",
  [4]: "极度外向，离不开人群",
};

const SN_LABELS: Record<number, string> = {
  [-4]: "极度直觉化，常忽略事实",
  [-3]: "想象力丰富，凭直觉",
  [-2]: "偏直觉",
  [-1]: "略偏直觉",
  [0]: "直觉与务实并重",
  [1]: "略偏务实",
  [2]: "偏务实",
  [3]: "很务实",
  [4]: "极度务实，只信眼见为实",
};

const TF_LABELS: Record<number, string> = {
  [-4]: "极度感性，凡事先看感受",
  [-3]: "很感性",
  [-2]: "偏感性",
  [-1]: "略偏感性",
  [0]: "理性与情感并重",
  [1]: "略偏理性",
  [2]: "偏理性",
  [3]: "很理性",
  [4]: "极度理性，凡事先讲逻辑",
};

const JP_LABELS: Record<number, string> = {
  [-4]: "极度随性，讨厌任何计划",
  [-3]: "很随性",
  [-2]: "偏随性",
  [-1]: "略偏随性",
  [0]: "灵活与计划并重",
  [1]: "略偏有规划",
  [2]: "偏有规划",
  [3]: "很有规划",
  [4]: "极度有计划，无规划即焦虑",
};

function describePersonality(p: Personality): string[] {
  return [
    `内外向(E/I)：${EI_LABELS[p.ei] ?? String(p.ei)}`,
    `直觉/实感(N/S)：${SN_LABELS[p.sn] ?? String(p.sn)}`,
    `情感/思考(F/T)：${TF_LABELS[p.tf] ?? String(p.tf)}`,
    `感知/判断(P/J)：${JP_LABELS[p.jp] ?? String(p.jp)}`,
  ];
}

// ---------------------------------------------------------------------------
// affection 文字
// ---------------------------------------------------------------------------

function describeAffection(v: number): string {
  if (v <= -4) return "极厌恶";
  if (v === -3) return "很讨厌";
  if (v === -2) return "不喜欢";
  if (v === -1) return "略反感";
  if (v === 0) return "中性";
  if (v === 1) return "略有好感";
  if (v === 2) return "有好感";
  if (v === 3) return "很喜欢";
  return "非常喜爱";
}

// ---------------------------------------------------------------------------
// 关系筛选：5 人上限 + 优先级
// ---------------------------------------------------------------------------

function selectTopPeers(
  c: Character,
  peers: Character[],
  tick: number,
): Character[] {
  if (peers.length <= MAX_PEERS_IN_PROMPT) return peers;
  const scored = peers.map((p) => {
    const rel = c.relations[p.id];
    let score = 0;
    if (rel) {
      const hasStrong = rel.kinds.some(
        (k) =>
          k === "spouse" ||
          k === "partner" ||
          BLOOD_RELATION_KINDS.has(k),
      );
      if (hasStrong) score += 1000;
      score += Math.abs(rel.affection) * 10;
      const decayIn =
        ACQUAINTANCE_DECAY_TICKS - (tick - rel.lastInteractionTick);
      if (rel.kinds.includes("acquaintance") && decayIn <= ACQUAINTANCE_WARN_TICKS) {
        score += 500;
      }
    }
    return { peer: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_PEERS_IN_PROMPT).map((s) => s.peer);
}

// ---------------------------------------------------------------------------
// describe relations
// ---------------------------------------------------------------------------

function describeRelations(
  c: Character,
  peers: Character[],
  tick: number,
): string {
  if (peers.length === 0) return "（同节点没有其他人）";
  return peers
    .map((p) => {
      const r = c.relations[p.id];
      if (!r) return `- ${p.name}（陌生人）`;
      const kinds = r.kinds.join("/");
      const aff = describeAffection(r.affection);
      const noteSuffix = r.note ? `——${r.note}` : "";
      let warn = "";
      if (r.kinds.includes("acquaintance")) {
        const decayIn =
          ACQUAINTANCE_DECAY_TICKS - (tick - r.lastInteractionTick);
        if (decayIn <= ACQUAINTANCE_WARN_TICKS && decayIn > 0) {
          warn = `（再 ${decayIn} 小时未互动就会淡出）`;
        }
      }
      return `- ${p.name}（${kinds}, ${aff}）${noteSuffix}${warn}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// memories / events / options
// ---------------------------------------------------------------------------

function describeMemories(memories: Memory[]): string {
  // 过滤掉离线启发式脚本写入的伪记忆（observe-circadian.ts 等）
  const filtered = memories.filter((m) => !m.content.includes("[heuristic]"));
  const recent = filtered.slice(-RECENT_MEMORY_LIMIT);
  if (recent.length === 0) return "（暂无记忆）";
  // 折叠相邻 content 完全相同的条目为单行
  type Group = { startTick: Tick; endTick: Tick; content: string; count: number };
  const groups: Group[] = [];
  for (const m of recent) {
    const last = groups[groups.length - 1];
    if (last && last.content === m.content) {
      last.endTick = m.tick;
      last.count += 1;
    } else {
      groups.push({ startTick: m.tick, endTick: m.tick, content: m.content, count: 1 });
    }
  }
  return groups
    .map((g) => {
      if (g.count === 1) return `- t=${g.startTick}: ${g.content}`;
      return `- t=${g.startTick}-${g.endTick}: ${g.content}（连续 ${g.count} 次）`;
    })
    .join("\n");
}

function describeEvents(events: WorldEvent[]): string {
  if (events.length === 0)
    return "（本时刻没有特别的事件，凭你的性格和当前状态决定要做什么）";
  return events
    .map((e) => `- [${e.category}, 强度 ${e.intensity}] ${e.description}`)
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
// vitals 7 档定性
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
  kind: "hunger" | "fatigue" | "hygiene",
): { phrase: string; urgency: VitalUrgency } {
  if (kind === "hunger") {
    if (value <= 0) return { phrase: "不饿", urgency: "none" };
    if (value < 5)
      return { phrase: `略有饥饿感（${value} 小时未进食）`, urgency: "mild" };
    if (value < 10)
      return { phrase: `明显饥饿（${value} 小时未进食）`, urgency: "moderate" };
    if (value < 14)
      return {
        phrase: `肚子很难受（${value} 小时未进食），注意力开始分散`,
        urgency: "high",
      };
    return {
      phrase: `极度饥饿（${value} 小时未进食），必须立刻进食`,
      urgency: "critical",
    };
  }
  if (kind === "fatigue") {
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
    if (value < 14)
      return {
        phrase: `困倦（连续 ${value} 小时未休息），眼皮在打架`,
        urgency: "high",
      };
    return {
      phrase: `非常疲惫（连续 ${value} 小时未休息），该考虑回家休息了`,
      urgency: "critical",
    };
  }
  // hygiene
  if (value <= 0) return { phrase: "干净清爽", urgency: "none" };
  if (value < 5)
    return {
      phrase: `略感不洁（${value} 小时未洗浴）`,
      urgency: "mild",
    };
  if (value < 10)
    return {
      phrase: `明显不干净（${value} 小时未洗浴）`,
      urgency: "moderate",
    };
  if (value < 14)
    return {
      phrase: `很脏了（${value} 小时未洗浴），自己都能闻到味道`,
      urgency: "high",
    };
  return {
    phrase: `极其肮脏（${value} 小时未洗浴），难以忍受`,
    urgency: "critical",
  };
}

// ---------------------------------------------------------------------------
// emotion 文字
// ---------------------------------------------------------------------------

const MOOD_WORDS: Record<number, string> = {
  [-4]: "极低落",
  [-3]: "很低落",
  [-2]: "有点低落",
  [-1]: "略低沉",
  [0]: "平静",
  [1]: "略愉悦",
  [2]: "愉快",
  [3]: "很开心",
  [4]: "极开心",
};

const STRESS_WORDS: Record<number, string> = {
  [0]: "放松",
  [1]: "略紧张",
  [2]: "有压力",
  [3]: "压力大",
  [4]: "极度紧张",
};

const SOCIAL_WORDS: Record<number, string> = {
  [-4]: "极度孤独",
  [-3]: "很孤单",
  [-2]: "有点寂寞",
  [-1]: "略想社交",
  [0]: "社交适中",
  [1]: "略满足",
  [2]: "社交满足",
  [3]: "很充实",
  [4]: "社交过度",
};

export function describeEmotion(emotion: Emotion): string[] {
  return [
    `心情：${MOOD_WORDS[emotion.mood] ?? String(emotion.mood)}`,
    `压力：${STRESS_WORDS[emotion.stress] ?? String(emotion.stress)}`,
    `社交满足：${SOCIAL_WORDS[emotion.social_satiety] ?? String(emotion.social_satiety)}`,
  ];
}

// ---------------------------------------------------------------------------
// time of day
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

export const DEFAULT_SLEEP_WINDOW: SleepWindow = { start: 22, duration: 8 };

/** 判断 hour 是否落在 [start, start+duration) 时间窗口内（处理跨午夜）。 */
export function inSleepWindow(hour: number, w: SleepWindow): boolean {
  const end = (w.start + w.duration) % 24;
  if (w.start < end) {
    return hour >= w.start && hour < end;
  }
  // 跨午夜（如 22..6）
  return hour >= w.start || hour < end;
}

/** 渲染窗口为 "22:00–06:00" 形式。 */
export function formatSleepWindow(w: SleepWindow): string {
  const end = (w.start + w.duration) % 24;
  const pad = (h: number) => String(h).padStart(2, "0");
  return `${pad(w.start)}:00–${pad(end)}:00`;
}

export function timeOfDay(
  tick: number,
  sleepWindow: SleepWindow = DEFAULT_SLEEP_WINDOW,
): {
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
  return { hour, day, period, isSleepHour: inSleepWindow(hour, sleepWindow) };
}

// ---------------------------------------------------------------------------
// action names (full 23-set)
// ---------------------------------------------------------------------------

const ACTION_NAMES: Record<ActionType, string> = {
  move: "移动",
  wait: "等待",
  observe: "观察",
  rest: "休息",
  eat: "进食",
  read: "阅读",
  work: "工作/学习",
  use_ability: "使用能力",
  sleep: "睡觉",
  nap: "小睡",
  bathe: "洗浴",
  exercise: "运动",
  meditate: "冥想",
  write: "书写",
  groom: "整理仪容",
  pace: "踱步",
  speak: "邀请说话",
  interact_object: "与物互动",
  interact_person: "与人互动",
  attack: "攻击",
  flee: "逃避",
  help: "帮助",
  gift: "馈赠",
  update_relation: "调整关系",
  // 对话协议内部（仅 schema 约束，不暴露给 LLM）
  accept_speak: "接受对话",
  reject_speak: "拒绝对话",
  leave_dialog: "离开对话",
};

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

/**
 * 通用世界规则——不嵌入任何角色专属信息（性格 / 作息窗口 / 家），
 * 让此段在所有 NPC 之间字节一致，最大化 prompt cache 命中。
 * 角色专属内容由 buildSystemPrompt 末尾的"自我认知"块单独承载。
 */
function worldRules(): string {
  return `你是 LLM-as-NPC 模拟世界中的一个角色。这是一个由"导演型玩家"在外部观察、并偶尔向某地点投放事件的虚拟小镇。

游戏时间：1 tick = 1 个游戏小时。你不需要思考"玩家"——你只在你的角色身份下做出与你性格相符的决定。

行动机制：
- 你**只能**通过调用 submit_action 工具来回复，禁止直接输出任何自然语言文本——直接吐文本视为本 tick 弃权。
- 你必须从封闭的 ActionType 集合中选一个 type，作为 submit_action 的参数。
- 你可以在 free_text 中加入说话内容或行动具体描述。
- reasoning 是你的内心独白，必须在其中显式引用一项你的性格特征（用文字描述，不要写数值）。这是硬性规则。
- self_importance 1-5，决定这件事是否进入你的长期记忆。
- 不要做超出当前可选行动列表的事；如果列表里没合适的，选 wait 或 observe。

移动机制：除标注 ⏱ 的远途节点外，move 不消耗时间——你可以本 tick 多次 move 后再做事，每次 move 后会重新感知新位置。但若你连续 5 次 move 仍未做事，会被强制停下。

昼夜节律：
- 1 日 = 24 tick。每个角色有自己的作息窗口（你本人的窗口与家见下方"自我认知"块）。
- 在你的作息窗口内，应在自己的住所睡觉（sleep）。除非有强烈理由（紧急事件、夜班、关键人际冲突），打破自己的作息是反常的，必须在 reasoning 里明确解释。
- 在作息窗口外，即使疲惫也只能 nap（小睡 4 小时），不能 sleep——把整段大觉留给作息时段，否则会打乱节律。

生理优先级：
- 当疲惫进入"非常疲惫"等级，sleep（窗口内）/ nap（窗口外）/ rest 优先于一切社交；当前位置不能休息（非 residence/private）时，首选 move 回自己的家。
- 当饥饿进入"很难受"以上，eat 同样优先于社交；当前位置不能 eat 时首选 move 去用餐场所。
- 性格维度仍主导**怎么做**（爱独处 / 爱热闹 / 易怒 / 稳重），但**做不做基本生理维护**不应被性格压制。
- 长期忽视基本生理（饥饿/疲惫顶到极限并持续）会让你失神、心情下沉，进而影响你做的每个决定——这是真实代价，不是花瓶提示。

关系提醒：
- 超过 14 游戏日没和某熟人接触，对方将从你的关系中淡出（acquaintance 标签被移除）。如果你想维持某段关系，应主动联络。

反循环：
- 若你过去几个 tick 已多次做同一类行动且情境无新变化（例如连续 4 个 tick 都在 speak），应主动切换行为。
- 若你已在同一节点超过 8 小时，且这里不是你的家、工作场所或庆典现场，应认真考虑 move 去别处。`;
}

// ---------------------------------------------------------------------------
// language instructions (system prompt 末段 + user prompt 末段共用)
// ---------------------------------------------------------------------------

function languageInstruction(lang: Language): string {
  if (lang === "zh") {
    return `输出语言：
- 你的 reasoning、free_text、emotion_tag 必须使用简体中文。
- 地名、人名等专有名词可以使用原文（如日文/英文），但叙述和内心活动**必须**是简体中文。
- 你的假想对话对象也使用简体中文（你所在世界的居民全部懂中文）。`;
  }
  if (lang === "en") {
    return `Output language:
- Your reasoning, free_text, and emotion_tag MUST be written in English.
- Place names and personal names may stay in their original language; narration and inner monologue MUST be English.
- Imagined conversation partners also speak English (every resident here understands English).`;
  }
  // ja
  return `出力言語：
- あなたの reasoning / free_text / emotion_tag は必ず日本語で書いてください。
- 地名・人名は原語のままで構いませんが、語りと内心の独白は必ず日本語で書きます。
- 想定する会話相手も日本語を話します（この世界の住人は全員日本語が分かります）。`;
}

function crossLanguageNote(lang: Language): string | null {
  if (lang === "zh") return null;
  if (lang === "en") {
    return "Note: your earlier short/long memories may be written in a different language. Continue replying in English regardless.";
  }
  return "注意：あなたの過去の短期・長期記憶は別の言語で書かれている可能性があります。それでも回答は必ず日本語で続けてください。";
}

function arrivalIntroBlock(lang: Language): string {
  if (lang === "zh") {
    return `你是刚抵达此地的访客或新住客。请在 reasoning 中编造一段简短的「我为何来到这里」的理由（1–2 句），与你的性格相符。`;
  }
  if (lang === "en") {
    return "You have just arrived in this place as a visitor or new resident. In reasoning, fabricate a brief reason (1–2 sentences) for why you came here, consistent with your personality.";
  }
  return "あなたはこの場所に到着したばかりの訪問者または新しい住人です。reasoning の中で、自分の性格と矛盾しない「ここに来た理由」を 1〜2 文で簡潔に作り上げてください。";
}

function submitActionInstruction(lang: Language): string {
  if (lang === "zh") {
    return "请**调用 submit_action 工具**返回你的决定（不要输出自然语言文本）。务必在 reasoning 中显式引用一项你的性格特征的文字描述。";
  }
  if (lang === "en") {
    return "Please **call the submit_action tool** to return your decision (do not output any free-form natural-language text). You must explicitly cite one textual personality trait of yours in reasoning.";
  }
  return "submit_action ツールを必ず呼び出して回答してください（自由形式の自然言語テキストは出力しないでください）。reasoning では自分の性格特徴の文字記述を 1 つ明示的に引用してください。";
}

/**
 * 把全图节点渲染成树形 + shortcut 列表，供 LLM 做多步路径规划。
 * 节点条目附带 [id]，方便 LLM 在 target_node_id 中直接复用。
 * 不嵌入任何角色专属信息（如"你的家"）—— 这部分挪到 system 末尾的角色块，
 * 让本段在所有 NPC 之间字节一致，最大化 prompt cache 命中。
 */
function describeMapGraph(nodes: MapNode[]): string {
  if (nodes.length === 0) return "";

  const childrenOf = new Map<string | null, MapNode[]>();
  for (const n of nodes) {
    const arr = childrenOf.get(n.parentId) ?? [];
    arr.push(n);
    childrenOf.set(n.parentId, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }

  const treeLines: string[] = [];
  const render = (n: MapNode, depth: number): void => {
    const indent = "  ".repeat(depth);
    // tags 内已包含 public/semi/private 同义词；privacy 字段不再单独渲染。
    const tagPart = n.tags.length > 0 ? n.tags.join("/") : n.privacy;
    const cost =
      n.travelCost && n.travelCost > 0 ? ` ⏱${n.travelCost}小时` : "";
    treeLines.push(`${indent}- ${n.name} [${n.id}]（${tagPart}）${cost}`);
    for (const kid of childrenOf.get(n.id) ?? []) render(kid, depth + 1);
  };
  for (const root of childrenOf.get(null) ?? []) render(root, 0);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const directed = new Set<string>();
  for (const n of nodes) {
    for (const sid of n.shortcuts) directed.add(`${n.id}|${sid}`);
  }
  const shortcutLines: string[] = [];
  const rendered = new Set<string>();
  for (const pair of directed) {
    if (rendered.has(pair)) continue;
    const [a, b] = pair.split("|");
    const aNode = byId.get(a);
    const bNode = byId.get(b);
    if (!aNode || !bNode) {
      rendered.add(pair);
      continue;
    }
    const reverse = `${b}|${a}`;
    if (directed.has(reverse)) {
      shortcutLines.push(`- ${aNode.name} [${a}] ↔ ${bNode.name} [${b}]`);
      rendered.add(pair);
      rendered.add(reverse);
    } else {
      shortcutLines.push(`- ${aNode.name} [${a}] → ${bNode.name} [${b}]`);
      rendered.add(pair);
    }
  }

  let out = `当前世界地图（缩进=父子；⏱N=进入需 N 小时；target_node_id 用方括号内的 id）：\n${treeLines.join("\n")}`;
  if (shortcutLines.length > 0) {
    out += `\n\n特殊通道（shortcuts，cost=0）：\n${shortcutLines.join("\n")}`;
  }
  return out;
}

/**
 * 角色专属"自我认知"块。放 system prompt 末尾，前面 worldRules + mapGraph +
 * languageInstruction 都在所有 NPC 之间字节一致 → prompt cache 在跨角色调用时
 * 仍能命中共享前缀。
 */
function characterBlock(
  character: Character,
  nodes: MapNode[],
  sleepWindow: SleepWindow,
): string {
  const lines: string[] = [
    "你的自我认知：",
    `- 名字：${character.name}`,
  ];
  const homeNode = character.homeNodeId
    ? nodes.find((n) => n.id === character.homeNodeId)
    : undefined;
  if (homeNode) {
    lines.push(`- 你的家：${homeNode.name} [${homeNode.id}]`);
  }
  lines.push(`- 作息窗口：${formatSleepWindow(sleepWindow)}`);
  lines.push("- 性格特征（用文字描述，**禁止在 reasoning 里写数值**）：");
  for (const s of describePersonality(character.personality)) {
    lines.push(`  · ${s}`);
  }
  lines.push(
    character.abilities.length > 0
      ? `- 能力：${character.abilities.map((a) => `${a.kind}(tier ${a.tier})`).join("、")}`
      : "- 能力：（无值得一提的特殊能力）",
  );
  return lines.join("\n");
}

export function buildSystemPrompt(args: {
  character: Character;
  worldName: string;
  nodes: MapNode[];
  language?: Language;
}): string {
  const { character, worldName, nodes } = args;
  const language = args.language ?? "zh";
  const sleepWindow = character.sleepWindow ?? DEFAULT_SLEEP_WINDOW;

  // 顺序刻意按"稳定 → 角色专属"排列，让 prompt cache 在跨角色调用时
  // 仍能命中共享前缀（worldRules + mapGraph + languageInstruction 字节一致）。
  const lines: string[] = [worldRules(), "", `你身处的世界：${worldName}。`];
  const mapGraph = describeMapGraph(nodes);
  if (mapGraph) lines.push("", mapGraph);
  lines.push("", languageInstruction(language));
  lines.push("", characterBlock(character, nodes, sleepWindow));
  return lines.join("\n");
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
      ? "- 距上次 rest/sleep：从未休息过"
      : `- 距上次 rest/sleep：${currentTick - facts.lastRestTick} 小时`,
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

function hereCanBathe(here: MapNode): boolean {
  return here.tags.includes("bathing");
}

export function buildUserPrompt(args: {
  character: Character;
  here: MapNode;
  companions: Character[];
  perceived: WorldEvent[];
  options: ActionOption[];
  tick: number;
  facts: AggregatedFacts;
  language?: Language;
  arrivalIntro?: boolean;
}): string {
  const { character, here, companions, perceived, options, tick, facts } = args;
  const language = args.language ?? "zh";
  const sleepWindow = character.sleepWindow ?? DEFAULT_SLEEP_WINDOW;
  const t = timeOfDay(tick, sleepWindow);
  const fatigue = qualifyVital(character.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(character.vitals.hunger, "hunger");
  const hygiene = qualifyVital(character.vitals.hygiene, "hygiene");

  const lines: string[] = [];

  // 1. 时间 + 作息引导
  lines.push(
    `当前时间：第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:00（${t.period}${t.isSleepHour ? "，已是你的作息时段" : ""}）。`,
  );
  const winText = formatSleepWindow(sleepWindow);
  if (facts.homeNodeName) {
    lines.push(`你的常规作息：${winText} 在 ${facts.homeNodeName} 休息。`);
  } else {
    lines.push(`你的常规作息：${winText}（未设定固定住所）。`);
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

  // 4. 生理状态（定性）
  lines.push("你当前的生理状态：");
  lines.push(`- 饥饿：${hunger.phrase}`);
  lines.push(`- 疲惫：${fatigue.phrase}`);
  lines.push(`- 卫生：${hygiene.phrase}`);

  // 4.1 情绪状态
  lines.push("你当前的情绪状态：");
  for (const line of describeEmotion(character.emotion)) {
    lines.push(`- ${line}`);
  }

  // 4.2 紧迫提醒
  const fatigueUrgent =
    fatigue.urgency === "high" ||
    fatigue.urgency === "critical" ||
    fatigue.urgency === "fatal";
  const hungerUrgent =
    hunger.urgency === "high" ||
    hunger.urgency === "critical" ||
    hunger.urgency === "fatal";
  const hygieneUrgent =
    hygiene.urgency === "high" ||
    hygiene.urgency === "critical" ||
    hygiene.urgency === "fatal";
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
  if (hygieneUrgent && !hereCanBathe(here)) {
    lines.push("⚠ 你身上很脏但当前位置不能洗浴，应优先 move 去澡堂或浴室。");
  }
  lines.push("");

  // 5. 同节点其他人物（最多 5）—— 0 人时整段省略
  if (companions.length > 0) {
    const topPeers = selectTopPeers(character, companions, tick);
    lines.push(
      companions.length > MAX_PEERS_IN_PROMPT
        ? `同节点其他人物（共 ${companions.length} 人，仅展示与你最相关的 ${topPeers.length}）：`
        : "同节点其他人物：",
    );
    lines.push(describeRelations(character, topPeers, tick));
    lines.push("");
  }

  // 6. 感知事件 —— 无事件时整段省略
  if (perceived.length > 0) {
    lines.push("你刚刚感知到的事件：");
    lines.push(describeEvents(perceived));
    lines.push("");
  }

  // 7. 短期记忆
  lines.push("你的近期短期记忆：");
  lines.push(describeMemories(character.shortMemory));
  lines.push("");

  // 8. 可选行动
  lines.push("你现在可以选择的行动（每项已带类型与必要的 target id）：");
  lines.push(describeOptions(options));
  lines.push("");

  // 跨语言记忆提示（仅 non-zh）
  const note = crossLanguageNote(language);
  if (note) {
    lines.push(note, "");
  }

  if (args.arrivalIntro) {
    lines.push(arrivalIntroBlock(language), "");
  }

  // 末尾仅保留提交指令；languageInstruction 已在 system 末尾提供，不再重复。
  lines.push(submitActionInstruction(language));

  return lines.join("\n");
}
