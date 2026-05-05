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
import type { Profession } from "@/domain/enums";
import { BLOOD_RELATION_KINDS, TICKS_PER_HOUR } from "@/domain/enums";
import type { AggregatedFacts } from "@/engine/facts";
import type {
  Character,
  DialogTurn,
  Emotion,
  MapNode,
  Memory,
  Personality,
  SleepWindow,
  WorldEvent,
} from "@/domain/types";
import type { ActionOption } from "@/engine/actions";
import type { Language } from "@/config/types";
import { actionRegistry } from "@/domain/action-system";

const SHORT_MEMORY_LIMIT = 4;
const DAILY_MEMORY_LIMIT = 6;
const WEEKLY_MEMORY_LIMIT = 6;
const MAX_PEERS_IN_PROMPT = 5;

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

const INTELLIGENCE_LABELS: Record<number, string> = {
  1: "你不太会转弯，遇事总是走最熟悉的路，很少冒出新的念头。",
  2: "你思维比较直，习惯按部就班。",
  3: "你做事会动脑筋，不是死板的人。",
  4: "你头脑灵活，遇事容易想到不同的做法，做决定时会在 reasoning 中设想多种可能。",
};

function describePersonality(p: Personality): string[] {
  return [
    `内外向(E/I)：${EI_LABELS[p.ei] ?? String(p.ei)}`,
    `直觉/实感(N/S)：${SN_LABELS[p.sn] ?? String(p.sn)}`,
    `情感/思考(F/T)：${TF_LABELS[p.tf] ?? String(p.tf)}`,
    `感知/判断(P/J)：${JP_LABELS[p.jp] ?? String(p.jp)}`,
  ];
}

function describePersonalityCompact(p: Personality, intelligence: number): string {
  const ei = p.ei >= 0 ? "E" : "I";
  const sn = p.sn >= 0 ? "N" : "S";
  const tf = p.tf >= 0 ? "F" : "T";
  const jp = p.jp >= 0 ? "J" : "P";
  const intel = INTELLIGENCE_LABELS[intelligence] ?? INTELLIGENCE_LABELS[2];
  return `性格：${ei}${sn}${tf}${jp}，${intel}`;
}

// ---------------------------------------------------------------------------
// directional relation labels
// ---------------------------------------------------------------------------

const DIRECTIONAL_KIND_LABELS: Record<string, string> = {
  boss: "老板",
  subordinate: "下属",
  colleague: "同事",
  spouse: "配偶",
  father: "父亲",
  mother: "母亲",
  son: "儿子",
  daughter: "女儿",
  older_brother: "哥哥",
  younger_brother: "弟弟",
  older_sister: "姐姐",
  younger_sister: "妹妹",
  partner: "伴侣",
  ex_partner: "前伴侣",
};

const REVERSE_KIND: Record<string, string | ((gender: string) => string)> = {
  boss: "下属",
  subordinate: "老板",
  spouse: "配偶",
  partner: "伴侣",
  colleague: "同事",
  father: (g) => (g === "male" ? "儿子" : "女儿"),
  mother: (g) => (g === "male" ? "儿子" : "女儿"),
  son: (g) => (g === "male" ? "父亲" : "母亲"),
  daughter: (g) => (g === "male" ? "父亲" : "母亲"),
  older_brother: (g) => (g === "male" ? "弟弟" : "妹妹"),
  younger_brother: (g) => (g === "male" ? "哥哥" : "姐姐"),
  older_sister: (g) => (g === "male" ? "弟弟" : "妹妹"),
  younger_sister: (g) => (g === "male" ? "哥哥" : "姐姐"),
  ex_partner: "前伴侣",
};

export function describeRelationBidirectional(self: Character, targetId: string): string {
  const rel = self.relations[targetId];
  if (!rel || rel.kinds.length === 0) {
    return "客观关系：你与 TA 尚无正式关系";
  }
  return rel.kinds.map((k) => {
    const forward = DIRECTIONAL_KIND_LABELS[k] ?? k;
    const revRaw = REVERSE_KIND[k];
    if (!revRaw) return `- 客观关系：TA 是你的${forward}`;
    const rev = typeof revRaw === "function" ? revRaw(self.gender) : revRaw;
    if (forward === rev) {
      return `- 客观关系：你们互为${forward}`;
    }
    return `- 客观关系：TA 是你的${forward}（你是 TA 的${rev}）`;
  }).join("\n");
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
  return peers.map(p => {
    const r = c.relations[p.id];
    if (!r) return `- ${p.name}（陌生人）`;
    const kindsDisplay = r.kinds.join("、");
    return `- ${p.name} — ${kindsDisplay}`;
  }).join("\n");
}

// ---------------------------------------------------------------------------
// memories / events / options
// ---------------------------------------------------------------------------

function describeMemoryTiers(
  short: Memory[],
  daily: Memory[],
  weekly: Memory[],
): string {
  const lines: string[] = [];

  // 短期记忆
  const filteredShort = short.filter((m) => !m.content.includes("[heuristic]"));
  // Remove exact consecutive duplicates (common from auto-wait actions)
  const deduped: Memory[] = [];
  for (let i = 0; i < filteredShort.length; i++) {
    if (i > 0 && filteredShort[i].content === filteredShort[i - 1].content) continue;
    deduped.push(filteredShort[i]);
  }
  const recentShort = deduped.slice(-SHORT_MEMORY_LIMIT);
  lines.push("你的近期短期记忆：");
  if (recentShort.length === 0) {
    lines.push("（暂无）");
  } else {
    for (const m of recentShort) {
      lines.push(`- t=${m.tick}: ${m.content}`);
    }
  }
  lines.push("");

  // 日记忆
  const recentDaily = daily.slice(-DAILY_MEMORY_LIMIT);
  if (recentDaily.length > 0) {
    lines.push("你的日记忆（最近几天的摘要）：");
    for (const m of recentDaily) {
      const gameDay = Math.floor(m.tick / (24 * TICKS_PER_HOUR));
      lines.push(`- 第 ${gameDay} 天: ${m.content}`);
    }
    lines.push("");
  }

  // 周记忆
  const recentWeekly = weekly.slice(-WEEKLY_MEMORY_LIMIT);
  if (recentWeekly.length > 0) {
    lines.push("你的周记忆（最近几周的摘要）：");
    for (const m of recentWeekly) {
      const weekNum = Math.floor(m.tick / (7 * 24 * TICKS_PER_HOUR));
      lines.push(`- 第 ${weekNum} 周: ${m.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
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

// ---------------------------------------------------------------------------
// image description (形象)
// ---------------------------------------------------------------------------

const APPEARANCE_BASE: Record<number, string> = {
  1: "面容平凡",
  2: "长相普通",
  3: "相貌端正",
  4: "面容出众",
};

export function buildImage(c: Character): string {
  const parts: string[] = [];

  // Base appearance
  parts.push(APPEARANCE_BASE[c.appearance] ?? "长相普通");

  // Physical overlays (vitals)
  if (c.vitals.hygiene >= 10) parts.push("邋遢不洁");
  if (c.vitals.fatigue >= 10) parts.push("两眼无神");
  if (c.vitals.hunger >= 10) parts.push("面有菜色");

  // Psychological overlays (emotion)
  if (c.emotion.mood >= 3) parts.push("神采奕奕");
  if (c.emotion.mood <= -3) parts.push("面色阴郁");
  if (c.emotion.stress >= 3) parts.push("神情紧绷");

  return parts.join("，");
}

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
  epoch: number,
  sleepWindow: SleepWindow = DEFAULT_SLEEP_WINDOW,
): {
  hour: number;
  minute: number;
  day: number;
  period: DayPeriod;
  isSleepHour: boolean;
} {
  const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;
  const gameDate = new Date(epoch + tick * MS_PER_TICK);
  const hour = gameDate.getHours();
  const minute = gameDate.getMinutes();
  const day = Math.floor(tick / (24 * TICKS_PER_HOUR));
  let period: DayPeriod;
  if (hour < 5) period = "深夜";
  else if (hour < 7) period = "凌晨";
  else if (hour < 9) period = "早晨";
  else if (hour < 12) period = "上午";
  else if (hour < 14) period = "中午";
  else if (hour < 17) period = "下午";
  else if (hour < 20) period = "傍晚";
  else period = "夜晚";
  return { hour, minute, day, period, isSleepHour: inSleepWindow(hour, sleepWindow) };
}

// ---------------------------------------------------------------------------
// action names (full 28-set)
// ---------------------------------------------------------------------------

let _cachedActionNames: Record<string, string> | null = null;
function getActionNames(): Record<string, string> {
  if (!_cachedActionNames) {
    _cachedActionNames = {};
    for (const type of actionRegistry.types()) {
      _cachedActionNames[type] = type;
    }
  }
  return _cachedActionNames;
}

/** Invalidate the action names cache after mod actions are registered. */
export function invalidateActionNamesCache(): void {
  _cachedActionNames = null;
}

function formatActionCounts(
  counts: Partial<Record<string, number>>,
): string {
  const entries = (Object.entries(counts) as Array<[string, number]>)
    .filter(([, n]) => n && n > 0)
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return "（暂无）";
  return entries.map(([k, v]) => `${getActionNames()[k] ?? k} ×${v}`).join("、");
}

// ---------------------------------------------------------------------------
// system prompt
// ---------------------------------------------------------------------------

/**
 * 通用世界规则——不嵌入任何角色专属信息（性格 / 作息窗口 / 家），
 * 让此段在所有 NPC 之间字节一致，最大化 prompt cache 命中。
 * 角色专属内容由 buildUserPrompt 开头的身份锚点 + 角色静态认知块单独承载。
 */
function worldRules(): string {
  return `你是 LLM-as-NPC 模拟世界中的一个角色。这是一个由"导演型玩家"在外部观察、并偶尔向某地点投放事件的虚拟小镇。

游戏时间：1 tick = 1/5 游戏小时（5 ticks = 1 游戏小时）。tick 是基本时间单位。你不需要思考"玩家"——你只在你的角色身份下做出与你性格相符的决定。

行动机制：
- 你**只能**调用 decide_action 工具来提交行动决定，禁止直接输出任何自然语言文本——直接吐文本视为本 tick 弃权。
- decide_action 的 action_type 参数选择你要执行的行动类型，可选值会在 prompt 末尾"可选行动"中列出。
- 根据你选择的 action_type，填写对应的 target_id / target_node_id / free_text / amount 等参数。
- you may write spoken content or action details in free_text。
- reasoning 是你的内心独白，必须在其中显式引用一项你的性格特征（用文字描述，不要写数值）。这是硬性规则。
- self_importance 1-5，决定这件事是否进入你的长期记忆。
- 不要做超出当前可选行动范围的事；如果没有合适的，选 action_type="wait"。

移动机制：1 tick = 1/5 游戏小时（5 ticks = 1 小时）。移动时你需要指定目的地（任意地图节点）、移动原因（如"去酒馆找田中喝酒"）和到达后要做的动作（arrival_action）。引擎会自动计算最短路径，每走一步消耗 1 tick。移动期间你无法主动决策（类似睡觉），但可被高强度事件打断。到达后自动执行你声明的到达动作。

昼夜节律：
- 1 日 = 120 tick（24 小时 × 5 tick/小时）。每个角色有自己的作息窗口（你本人的窗口与家见下方"自我认知"块）。
- 在你的作息窗口内，应在自己的住所睡觉（sleep）。除非有强烈理由（紧急事件、夜班、关键人际冲突），打破自己的作息是反常的，必须在 reasoning 里明确解释。
- 在作息窗口外，即使疲惫也只能 rest，不能 sleep——把整段大觉留给作息时段，否则会打乱节律。

生理优先级：
- 当疲惫进入"非常疲惫"等级，sleep（窗口内）/ nap（窗口外）/ rest 优先于一切社交；当前位置不能休息（非 residence/private）时，首选 move 回自己的家。
- 当饥饿进入"很难受"以上，eat 同样优先于社交；当前位置不能 eat 时首选 move 去用餐场所。
- 性格维度仍主导**怎么做**（爱独处 / 爱热闹 / 易怒 / 稳重），但**做不做基本生理维护**不应被性格压制。
- 长期忽视基本生理（饥饿/疲惫顶到极限并持续）会让你失神、心情下沉，进而影响你做的每个决定——这是真实代价，不是花瓶提示。

关系提醒：
- 超过 14 游戏日没和某熟人接触，对方将从你的关系中淡出（acquaintance 标签被移除）。如果你想维持某段关系，应主动联络。

反循环：
- 若你过去几个 tick 已多次做同一类行动且情境无新变化（例如连续 4 个 tick 都在做同一类行动），应主动切换行为。
- 若你已在同一节点超过 8 小时，且这里不是你的家、工作场所或庆典现场，应认真考虑 move 去别处。`;
}

// ---------------------------------------------------------------------------
// language instructions (system prompt 末段 + user prompt 末段共用)
// ---------------------------------------------------------------------------

export function languageInstruction(lang: Language): string {
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
    return "请**调用 decide_action 工具**返回你的决定（不要输出自然语言文本）。务必在 reasoning 中显式引用一项你的性格特征的文字描述。";
  }
  if (lang === "en") {
    return "Please **call the decide_action tool** to return your decision (do not output any free-form natural-language text). You must explicitly cite one textual personality trait of yours in reasoning.";
  }
  return "decide_action ツールを必ず呼び出して回答してください（自由形式の自然言語テキストは出力しないでください）。reasoning では自分の性格特徴の文字記述を 1 つ明示的に引用してください。";
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
    treeLines.push(`${indent}- ${n.name} [${n.id}]（${tagPart}）`);
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

  let out = `当前世界地图（缩进=父子；target_node_id 用方括号内的 id）：\n${treeLines.join("\n")}`;
  if (shortcutLines.length > 0) {
    out += `\n\n特殊通道（shortcuts，cost=0）：\n${shortcutLines.join("\n")}`;
  }
  return out;
}

const PROFESSION_LABELS: Record<Profession, string> = {
  farmer: "农民", rancher: "牧场主", fisherman: "渔夫", lumberjack: "伐木工", hunter: "猎人",
  chef: "厨师", baker: "面包师", brewer: "酿酒师",
  blacksmith: "铁匠", carpenter: "木匠", tailor: "裁缝",
  merchant: "商人", grocer: "杂货店主", innkeeper: "旅店老板",
  doctor: "医生", nurse: "护士", teacher: "教师", librarian: "图书管理员",
  priest: "神官", mailman: "邮递员", mayor: "镇长官", student: "学生", unemployed: "无业",
};

/**
 * 角色静态认知块（原 system prompt characterBlock）。
 * 移入 user prompt，使 system prompt 在所有 NPC 之间字节一致，最大化 prompt cache 命中。
 * 名字已移至 user prompt 开头的身份锚点行，此处不再重复。
 */
export function buildCharacterStaticBlock(
  character: Character,
  nodes: MapNode[],
  sleepWindow: SleepWindow,
): string {
  const lines: string[] = [
    "你的自我认知：",
    `- 年龄：${character.age} 岁`,
    `- 性别：${character.gender === "male" ? "男" : character.gender === "female" ? "女" : "其他"}`,
    `- 身份：${PROFESSION_LABELS[character.profession] ?? character.profession}`,
  ];
  // Economic status (static info)
  if (character.expenseExempt) {
    lines.push("- 生存开销：免单（未成年人或全包游客）");
  } else {
    lines.push("- 生存开销：吃饭 15💰/次，洗澡 10💰/次");
  }
  lines.push(`- 当前持有：${character.money} 金钱`);
  const actNode = character.activityNodeId
    ? nodes.find((n) => n.id === character.activityNodeId)
    : undefined;
  const restNode = character.restNodeId
    ? nodes.find((n) => n.id === character.restNodeId)
    : undefined;
  if (actNode) {
    lines.push(`- 你的活动处：${actNode.name} [${actNode.id}]`);
  }
  if (restNode) {
    lines.push(`- 你的休息处：${restNode.name} [${restNode.id}]`);
  }
  lines.push(`- 作息窗口：${formatSleepWindow(sleepWindow)}`);
  lines.push(`- 生平简介：${character.biography}`);
  lines.push("- 性格特征（用文字描述，**禁止在 reasoning 里写数值**）：");
  for (const s of describePersonality(character.personality)) {
    lines.push(`  · ${s}`);
  }
  lines.push(
    `- 思维特点：${INTELLIGENCE_LABELS[character.intelligence] ?? INTELLIGENCE_LABELS[2]}`,
  );
  if (character.speakingStyle) {
    lines.push(`- 说话风格：${character.speakingStyle}`);
  }
  if (character.sickness) {
    lines.push("- ⚠ 你正在生病，身体不适。");
  }
  lines.push(
    character.abilities.length > 0
      ? `- 能力：${character.abilities.map((a) => `${a.kind}(tier ${a.tier})`).join("、")}`
      : "- 能力：（无值得一提的特殊能力）",
  );
  if (character.liked) lines.push(`- 你最喜欢：${character.liked}`);
  if (character.disliked) lines.push(`- 你最讨厌：${character.disliked}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// dialog prompt builders
// ---------------------------------------------------------------------------

export function buildSelfImage(c: Character, locationName?: string): string {
  const lines: string[] = [
    "关于你自己：",
    `- 姓名：${c.name}`,
    `- 年龄：${c.age} 岁`,
    `- 性别：${c.gender === "male" ? "男" : c.gender === "female" ? "女" : "其他"}`,
    `- 职业：${PROFESSION_LABELS[c.profession] ?? c.profession}`,
    `- 形象：${buildImage(c)}`,
  ];
  if (locationName) {
    lines.push(`- 当前在：${locationName}`);
  }
  return lines.join("\n");
}

export function buildPeerImage(self: Character, peer: Character): string {
  const lines: string[] = [
    `关于 ${peer.name}：`,
    `- 年龄：${peer.age} 岁`,
    `- 性别：${peer.gender === "male" ? "男" : peer.gender === "female" ? "女" : "其他"}`,
    `- 职业：${PROFESSION_LABELS[peer.profession] ?? peer.profession}`,
    `- 形象：${buildImage(peer)}`,
  ];
  lines.push(describeRelationBidirectional(self, peer.id));
  const impression = self.impressionBook[peer.id];
  if (impression && impression.trim().length > 0) {
    lines.push(`- 你对 TA 的印象：${impression}`);
  } else {
    lines.push("- 你对 TA 的印象：暂无特别印象");
  }
  return lines.join("\n");
}

/**
 * 接受/拒绝决策 prompt。
 * B 看到 A 的开场白（freeText），决定是否接茬。
 * A 的 reasoning 不可见（仅 freeText 暴露给对方）。
 */
export function buildAcceptDecisionPrompt(args: {
  self: Character;
  requesterName: string;
  freeText: string;
  here: MapNode;
  peer: Character;
  tick: number;
  epoch: number;
  language?: Language;
}): string {
  const { self, requesterName, freeText, here, peer, tick, epoch } = args;
  const language = args.language ?? "zh";
  const t = timeOfDay(tick, epoch, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW);
  const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(self.vitals.hunger, "hunger");

  const lines: string[] = [];

  lines.push(`${requesterName} 想和你说话："${freeText}"`);
  lines.push("");
  lines.push(buildSelfImage(self, here.name));
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push("你当前的状态：");
  lines.push(`- 疲惫：${fatigue.phrase}`);
  lines.push(`- 饥饿：${hunger.phrase}`);
  lines.push(`- 心情：${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
  lines.push(`- 压力：${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
  lines.push(`- 社交满足：${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
  lines.push("");
  lines.push(describePersonalityCompact(self.personality, self.intelligence));
  lines.push("");

  const timeStr = `第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;
  lines.push(`当前时间：${timeStr}`, "");

  lines.push(
    language === "zh"
      ? "决定：你是否要和这个人说话？请调用 submit_accept_decision 工具，输出 accept_speak 或 reject_speak。"
      : language === "en"
        ? "Decide: will you talk to this person? Call submit_accept_decision with accept_speak or reject_speak."
        : "決定：この人と話しますか？submit_accept_decision を呼び出し、accept_speak か reject_speak を返してください。",
  );

  return lines.join("\n");
}

/**
 * 对话单轮 prompt。speaker 基于 transcript 历史输出下一句话或结束对话。
 */
export function buildDialogTurnPrompt(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
  pendingAction?: import("@/domain/types").DialogueActionRequest;
  dialogueActions?: import("@/domain/action-system").ActionDefinition[];
  upcomingEntries?: import("@/domain/types").NotebookEntry[];
}): string {
  const { self, peer, transcript, here, pendingAction, dialogueActions, upcomingEntries } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      if (t.speakerId === "__system__") {
        return `【${t.line ?? ""}】`;
      }
      const name = t.speakerId === self.id ? self.name : peer.name;
      return `${name}: ${t.line ?? ""}`;
    })
    .join("\n");

  const personalityLine = describePersonalityCompact(self.personality, self.intelligence);

  const lines: string[] = [];

  // Common: pending action context
  function buildPendingActionBlock(lang: Language): string {
    if (!pendingAction) return "";
    const requesterName = pendingAction.requesterId === self.id ? "你" : peer.name;
    const params = pendingAction.params;
    const detail = params.amount
      ? ` 金额：${params.amount}💰`
      : params.free_text
        ? ` "${params.free_text}"`
        : "";
    if (lang === "zh") {
      return `\n⚠️ 对方发起的交互：${requesterName} 想对你执行「${pendingAction.actionType}」。${detail}\n你可以同时调用 submit_dialog_turn + respond_to_dialogue_action（接受 accept 或拒绝 reject），或仅说话不理睬。\n`;
    }
    if (lang === "en") {
      return `\n⚠️ Pending interaction: ${requesterName} wants to perform "${pendingAction.actionType}" on you.${detail}\nYou can call submit_dialog_turn + respond_to_dialogue_action (accept or reject) together, or just speak to ignore it.\n`;
    }
    return `\n⚠️ 相手からのアクション：${requesterName} があなたに「${pendingAction.actionType}」を実行しようとしています。${detail}\nsubmit_dialog_turn + respond_to_dialogue_action（accept または reject）を同時に呼び出すか、発言だけして無視することもできます。\n`;
  }

  // Common: available dialogue actions
  function buildDialogueActionsBlock(lang: Language): string {
    if (!dialogueActions || dialogueActions.length === 0) return "";
    const actionList = dialogueActions
      .map((a) => {
        const extra = a.extraParams
          ? Object.keys(a.extraParams).filter(k => k !== "free_text").join(", ")
          : "";
        return `- ${a.type}${extra ? ` (需要 ${extra})` : ""}`;
      })
      .join("\n");
    if (lang === "zh") {
      return `\n你可以在此对话中发起的行为（调用 propose_dialogue_action，与 submit_dialog_turn 同时调用）：\n${actionList}\n`;
    }
    if (lang === "en") {
      return `\nActions you can propose during this dialogue (call propose_dialogue_action together with submit_dialog_turn):\n${actionList}\n`;
    }
    return `\nこの会話中に提案できるアクション（propose_dialogue_action を submit_dialog_turn と同時に呼び出してください）：\n${actionList}\n`;
  }

  function buildUpcomingBlock(lang: Language): string {
    if (!upcomingEntries || upcomingEntries.length === 0) return "";
    const MS_PER_TICK = (60 / 5) * 60 * 1000;
    const epoch = Date.UTC(2026, 4, 1); // May 2026 UTC
    const lines = upcomingEntries.map((e) => {
      const date = new Date(epoch + e.scheduledTick * MS_PER_TICK);
      const hh = String(date.getUTCHours()).padStart(2, "0");
      const mm = String(date.getUTCMinutes()).padStart(2, "0");
      return `${hh}:${mm} — ${e.content}`;
    });
    if (lang === "zh") return `\n你未来一小时内的待办：${lines.join("; ")}\n`;
    if (lang === "en") return `\nYour upcoming tasks in the next hour: ${lines.join("; ")}\n`;
    return `\n今後1時間以内の予定：${lines.join("; ")}\n`;
  }

  if (language === "zh") {
    lines.push(`你是 ${self.name}，正在和 ${peer.name} 对话。`);
    lines.push("");
    lines.push(buildSelfImage(self, here.name));
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(personalityLine);
    lines.push("");
    lines.push("对话记录：");
    lines.push(history || "(尚未开始)");
    lines.push(buildPendingActionBlock("zh"));
    lines.push(buildDialogueActionsBlock("zh"));
    lines.push(buildUpcomingBlock("zh"));
    lines.push("现在轮到你说话。请根据你的性格自然地回应，不要重复对方刚说过的话。调用 submit_dialog_turn：kind=\"say\" 并填写 line。如果想结束对话，请调用 end_conversation。");
  } else if (language === "en") {
    lines.push(`You are ${self.name}, speaking with ${peer.name}.`);
    lines.push("");
    lines.push(buildSelfImage(self, here.name));
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(personalityLine);
    lines.push("");
    lines.push("Conversation:");
    lines.push(history || "(not yet started)");
    lines.push(buildPendingActionBlock("en"));
    lines.push(buildDialogueActionsBlock("en"));
    lines.push(buildUpcomingBlock("en"));
    lines.push("It's your turn. Respond naturally based on your personality — do not repeat what the other person just said. Call submit_dialog_turn with kind=\"say\" and line. If you want to end the conversation, call end_conversation.");
  } else {
    lines.push(`あなたは ${self.name} です。${peer.name} と会話しています。`);
    lines.push("");
    lines.push(buildSelfImage(self, here.name));
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(personalityLine);
    lines.push("");
    lines.push("会話の記録：");
    lines.push(history || "(まだ始まっていません)");
    lines.push(buildPendingActionBlock("ja"));
    lines.push(buildDialogueActionsBlock("ja"));
    lines.push(buildUpcomingBlock("ja"));
    lines.push("あなたの番です。自分の性格に基づいて自然に応答してください。相手が今言ったことをそのまま繰り返さないでください。submit_dialog_turn で kind=\"say\" を呼び出し line を入力してください。会話を終了する場合は end_conversation を呼び出してください。");
  }

  return lines.join("\n");
}

/**
 * 对话摘要 prompt。对话结束后生成 1-2 句摘要。
 */
export function buildDialogSummaryPrompt(args: {
  openerName: string;
  openerId: string;
  responderName: string;
  responderId: string;
  transcript: DialogTurn[];
  language?: Language;
}): string {
  const { openerName, openerId, responderName, responderId, transcript } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      const name = t.speakerId === openerId ? openerName : responderName;
      return `${name}：${t.line ?? ""}`;
    })
    .join("\n");

  const instruction =
    language === "zh"
      ? `以下是一段对话的完整记录。请用 1-2 句话总结这次对话的核心内容与氛围。如果对话让你对对方产生了新的印象，可以在 memorize 中更新。调用 submit_dialog_summary 工具返回你的摘要。\n\n对话：\n${history}`
      : language === "en"
        ? `Below is the transcript of a conversation. Summarize its core content and atmosphere in 1-2 sentences. If the conversation gave you new impressions of the other person, you may update them in memorize. Call submit_dialog_summary to return your summary.\n\nConversation:\n${history}`
        : `以下は会話の文字起こしです。この会話の核心的な内容と雰囲気を 1〜2 文で要約してください。会話を通じて相手に対する新しい印象があれば、memorize で更新できます。submit_dialog_summary を呼び出して要約を返してください。\n\n会話：\n${history}`;

  return instruction;
}

/**
 * 补救轮 context 行。附加到主决策的 buildUserPrompt 末尾，
 * 告知 A 被拒/autoFail 后必须选非 speak 的行动。
 */
export function buildSalvageContext(args: {
  rejectReason: string;
}): string {
  return `⚠ ${args.rejectReason} 你不能再对任何人发起对话邀请。请选一个其他行动。`;
}

export function buildSystemPrompt(args: {
  worldName: string;
  nodes: MapNode[];
  language?: Language;
}): string {
  const { worldName, nodes } = args;
  const language = args.language ?? "zh";

  // 仅包含所有 NPC 共享的世界规则 + 地图 + 语言指令，100% 字节一致 → 跨角色 prompt cache 完全命中。
  const lines: string[] = [worldRules(), "", `你身处的世界：${worldName}。`];
  const mapGraph = describeMapGraph(nodes);
  if (mapGraph) lines.push("", mapGraph);
  lines.push("", languageInstruction(language));
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
    const verb = getActionNames()[type] ?? type;
    const ok = success ? "" : "（未成功）";
    const detail = freeText ? `："${freeText.slice(0, 40)}"` : "";
    lines.push(`- 上一 tick 你的行动：${verb}${ok}${detail}`);
  } else {
    lines.push("- 上一 tick：（无历史，世界刚开始）");
  }

  lines.push(
    facts.lastRestTick === undefined
      ? "- 距上次 rest/sleep：从未休息过"
      : `- 距上次 rest/sleep：${Math.floor((currentTick - facts.lastRestTick) / TICKS_PER_HOUR)} 小时`,
  );
  lines.push(
    facts.lastEatTick === undefined
      ? "- 距上次 eat：从未进食过"
      : `- 距上次 eat：${Math.floor((currentTick - facts.lastEatTick) / TICKS_PER_HOUR)} 小时`,
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
  epoch: number;
  facts: AggregatedFacts;
  language?: Language;
  arrivalIntro?: boolean;
  allCharacters?: Character[];
  nodes: MapNode[];
  activeEventDefs?: import("@/domain/events").GlobalEventDef[];
  upcomingNotebookText?: string;
}): string {
  const { character, here, companions, perceived, options, tick, epoch, facts, allCharacters, nodes, activeEventDefs, upcomingNotebookText } = args;
  const language = args.language ?? "zh";
  const sleepWindow = character.sleepWindow ?? DEFAULT_SLEEP_WINDOW;
  const t = timeOfDay(tick, epoch, sleepWindow);
  const fatigue = qualifyVital(character.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(character.vitals.hunger, "hunger");
  const hygiene = qualifyVital(character.vitals.hygiene, "hygiene");

  const lines: string[] = [];

  // 0. 身份锚点 —— user prompt 的第一行
  const profLabel = PROFESSION_LABELS[character.profession] ?? character.profession;

  // Build name lookup map for workplace relation labels
  const nameMap = new Map<string, string>();
  if (allCharacters) {
    for (const ac of allCharacters) nameMap.set(ac.id, ac.name);
  }
  for (const c of companions) nameMap.set(c.id, c.name);

  // Extract workplace relationships from relations
  const workplaceParts: string[] = [];
  for (const [targetId, rel] of Object.entries(character.relations)) {
    const targetName = nameMap.get(targetId) ?? targetId;
    if (rel.kinds.includes("boss")) workplaceParts.push(`${targetName}是你的老板`);
    if (rel.kinds.includes("subordinate")) workplaceParts.push(`${targetName}是你的下属`);
    if (rel.kinds.includes("colleague")) workplaceParts.push(`${targetName}是你的同事`);
  }

  lines.push(`你是${character.name}，${character.age}岁的${profLabel}。`);
  if (workplaceParts.length > 0) {
    lines.push(workplaceParts.join("；") + "。");
  }
  lines.push("");

  // 0.5. 角色静态认知（原 system prompt characterBlock）
  lines.push(buildCharacterStaticBlock(character, nodes, sleepWindow));
  lines.push("");

  // 0.6. 角色目标
  if (character.shortTermGoal || character.longTermGoal) {
    lines.push("## 你的目标");
    if (character.shortTermGoal) lines.push(`短期目标：${character.shortTermGoal.goal}`);
    if (character.longTermGoal) lines.push(`长期目标：${character.longTermGoal.goal}`);
    lines.push("");
  }

  // 1. 你的连续行为
  lines.push("你的连续行为：");
  lines.push(describeContinuity(facts, here.name, tick));
  lines.push("");

  // 2. 当前位置
  lines.push(
    `你现在的位置：${here.name}（${here.privacy}, ${here.tags.join("/") || "无标签"}）`,
  );
  lines.push(`位置描述：${here.description || "（无）"}`);
  lines.push("");

  // 3. 生理状态（定性）
  lines.push("你当前的生理状态：");
  lines.push(`- 饥饿：${hunger.phrase}`);
  lines.push(`- 疲惫：${fatigue.phrase}`);
  lines.push(`- 卫生：${hygiene.phrase}`);

  // 3.1 情绪状态
  lines.push("你当前的情绪状态：");
  for (const line of describeEmotion(character.emotion)) {
    lines.push(`- ${line}`);
  }

  // 3.2 紧迫提醒
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
        facts.restNodeName ? `，应优先 move 回 ${facts.restNodeName}` : "，应优先 move 回有床的住所"
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

  // Economic state
  if (!character.expenseExempt) {
    const eatCost = 15;
    const batheCost = 10;
    lines.push("你的经济状态：");
    lines.push(`- 持有金钱：${character.money}`);
    lines.push(`- 生存开销：吃饭 ${eatCost}/次，洗澡 ${batheCost}/次`);
    if (character.money < Math.max(eatCost, batheCost)) {
      lines.push("⚠️ 资金紧张：余额不足以支付下一次吃饭/洗澡的费用。你必须想办法获得收入，或者向他人求助。");
    }
    if (character.incomeLevel <= 0) {
      lines.push("- 你目前没有工作收入来源。");
    }
    lines.push("");
  }

  // 4. 同节点其他人物（最多 5）—— 0 人时整段省略
  if (companions.length > 0) {
    const names = companions.map(c => `${c.name}[${c.id}]`).join("、");
    lines.push(`同节点其他人物（共 ${companions.length} 人）：${names}`);
    lines.push("如果你需要了解其中某人的信息，请调用 recall 工具查询。");
    lines.push("");
  }

  // 5. 感知事件 —— 无事件时整段省略
  if (perceived.length > 0) {
    lines.push("你刚刚感知到的事件：");
    lines.push(describeEvents(perceived));
    lines.push("");
  }

  // 6. 三层记忆（短期 / 日 / 周）
  lines.push(describeMemoryTiers(
    character.shortMemory,
    character.dailyMemory,
    character.longMemory,
  ));
  lines.push("");

  // 7. 可选行动
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

  // 8. 当前时间（每 tick 变化，放在末尾以最大化 prompt cache 前缀命中）
  const timeLabel = `第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}${t.isSleepHour ? "，已是你的作息时段" : ""}）`;
  lines.push(`当前时间：${timeLabel}`, "");

  // Active global events
  if (activeEventDefs && activeEventDefs.length > 0) {
    const eventLines = activeEventDefs.map((e) =>
      `${e.name}：${e.description}`
    );
    lines.push("## ⚠️ 当前全局事件");
    for (const line of eventLines) {
      lines.push(line);
    }
    lines.push("");
  }

  // Notebook entries
  if (upcomingNotebookText && upcomingNotebookText.length > 0) {
    lines.push(upcomingNotebookText, "");
  }

  // 末尾仅保留提交指令；languageInstruction 已在 system 末尾提供，不再重复。
  lines.push(submitActionInstruction(language));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// memory compression prompt builders
// ---------------------------------------------------------------------------

/**
 * 构建睡觉时的记忆压缩 prompt。输入清醒期的短期记忆，输出第一人称日摘要。
 */
export function buildMemoryCompressionPrompt(args: {
  characterName: string;
  memories: Memory[];
  language?: Language;
}): string {
  const { characterName, memories } = args;
  const language = args.language ?? "zh";

  if (memories.length === 0) {
    if (language === "zh") return `你是 ${characterName}。自从上次睡觉后，你没有值得记住的经历。调用 submit_memory_summary 返回"今天很平静，没什么特别的事。"`;
    if (language === "en") return `You are ${characterName}. You had no notable experiences since you last slept. Call submit_memory_summary with "A quiet day with nothing much happening."`;
    return `あなたは${characterName}です。前回の睡眠以降、特に記憶に残る出来事はありませんでした。submit_memory_summary で「今日は穏やかな一日だった」と返してください。`;
  }

  const memoryLines = memories
    .map((m) => `- t=${m.tick}: ${m.content}`)
    .join("\n");

  if (language === "zh") {
    return `你是 ${characterName}，正在回顾从上次睡醒到现在的经历。以下是这段时间发生的事情：

${memoryLines}

请用 2-5 句简体中文（第一人称"我"）总结这段清醒期间最主要的事情、与人互动和感受。调用 submit_memory_summary 工具返回你的摘要。`;
  }
  if (language === "en") {
    return `You are ${characterName}, reviewing experiences since you last woke up. Here's what happened:

${memoryLines}

Summarize the most important events, interactions, and feelings in 2-5 English sentences using first person. Call submit_memory_summary to return your summary.`;
  }
  return `あなたは${characterName}です。前回起きてから今までの出来事を振り返っています：

${memoryLines}

この間の主な出来事、人との交流、感情を日本語の第一人称で2〜5文にまとめてください。submit_memory_summary を呼び出して要約を返してください。`;
}

/**
 * 构建周记忆压缩 prompt。输入 7 条日摘要，输出周摘要。
 */
export function buildWeeklyCompressionPrompt(args: {
  characterName: string;
  dailySummaries: string[];
  language?: Language;
}): string {
  const { characterName, dailySummaries } = args;
  const language = args.language ?? "zh";

  const lines = dailySummaries
    .map((s, i) => `第 ${i + 1} 天：${s}`)
    .join("\n");

  if (language === "zh") {
    return `你是 ${characterName}，正在回顾这一周（7 天）的生活。以下是每天的摘要：

${lines}

请用 2-4 句简体中文（第一人称"我"）总结这一周最主要的生活变化、重要事件和情感起伏。调用 submit_memory_summary 工具返回你的摘要。`;
  }
  if (language === "en") {
    return `You are ${characterName}, reviewing your past week (7 days). Here are your daily summaries:

${lines}

Summarize the key life changes, important events, and emotional shifts of this week in 2-4 English sentences using first person. Call submit_memory_summary to return your summary.`;
  }
  return `あなたは${characterName}です。この一週間（7日間）を振り返っています：

${lines}

この一週間の主な生活の変化、重要な出来事、感情の起伏を日本語の第一人称で2〜4文にまとめてください。submit_memory_summary を呼び出して要約を返してください。`;
}

/**
 * 对话中注入时间信息。让 LLM 感知当前时间和对话持续时长。
 */
export function injectTimeMessage(args: {
  tick: number;
  epoch: number;
  tickStarted: number;
  language?: Language;
}): string {
  const { tick, epoch, tickStarted } = args;
  const language = args.language ?? "zh";
  // Show the time after this round's conversation (tick+1), since the message is
  // injected after turns complete and one tick's worth of game time has passed.
  const displayTick = tick + 1;
  const t = timeOfDay(displayTick, epoch);
  const elapsedTicks = displayTick - tickStarted;
  const elapsedHours = Math.floor(elapsedTicks / TICKS_PER_HOUR);
  const elapsedMinutes = Math.floor((elapsedTicks % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));

  const timeStr = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;

  const totalMinutes = elapsedHours * 60 + elapsedMinutes;

  // Gentle reminder — NPCs tend to forget the end_conversation tool exists
  const endHint = language === "zh"
    ? "如果聊得差不多了，可以调用 end_conversation 工具来自然结束对话。"
    : language === "en"
      ? "If the conversation is winding down, use the end_conversation tool to end it naturally."
      : "会話が一段落したら、end_conversation ツールを呼び出して自然に終了してください。";

  if (language === "zh") {
    const dur = elapsedHours > 0 ? `${elapsedHours} 小时 ${elapsedMinutes} 分钟` : `${elapsedMinutes} 分钟`;
    return `现在已经 ${timeStr} 了，你们已经聊了 ${dur}（${totalMinutes} 分钟）。${endHint}`;
  }
  if (language === "en") {
    const dur = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMinutes}m` : `${elapsedMinutes}m`;
    return `It's now ${timeStr}, you've been talking for ${dur} (${totalMinutes} min). ${endHint}`;
  }
  const dur = elapsedHours > 0 ? `${elapsedHours} 時間 ${elapsedMinutes} 分` : `${elapsedMinutes} 分`;
  return `もう ${timeStr} です、${dur}（${totalMinutes} 分）話し続けています。${endHint}`;
}

// ---------------------------------------------------------------------------
// Pre-sleep reflection prompt
// ---------------------------------------------------------------------------

export function buildReflectionPrompt(args: { character: Character; language?: Language }): string {
  const { character } = args;
  const language = args.language ?? "zh";

  const shortMemories = character.shortMemory
    .filter(m => !m.content.includes("[heuristic]"))
    .map(m => `- ${m.content}`).join("\n");
  const dailyMemories = character.dailyMemory.slice(-7)
    .map(m => `- ${m.content}`).join("\n");
  const longMemories = character.longMemory.slice(-14)
    .map(m => `- ${m.content}`).join("\n");
  const impressions = Object.entries(character.impressionBook)
    .filter(([, v]) => v && v.length > 0)
    .map(([id, text]) => `- ${id}: ${text}`).join("\n");
  const goalsText = [
    character.shortTermGoal ? `短期目标：${character.shortTermGoal.goal}` : null,
    character.longTermGoal ? `长期目标：${character.longTermGoal.goal}` : null,
  ].filter(Boolean).join("\n");

  const likedText = character.liked || "（暂无）";
  const dislikedText = character.disliked || "（暂无）";

  return `你是${character.name}，现在是睡前反思时间。回顾今天和过去的经历，反思以下方面：

## 短期记忆（今天）
${shortMemories || "（无）"}

## 日常记忆
${dailyMemories || "（无）"}

## 长期记忆
${longMemories || "（无）"}

## 你对其他人的印象
${impressions || "（暂无任何印象）"}

## 当前目标
${goalsText || "（暂无目标）"}

## 当前喜好
最喜欢：${likedText}
最讨厌：${dislikedText}

请调用 submit_reflection 工具输出你的反思结果。以下各项都是可选的，只填你确实想改变的：
- memorize: 更新你对某些人的印象（空 impression 代表忘记）
- liked: 更新你最喜欢的人或事
- disliked: 更新你最讨厌的人或事
- short_term_goal: 更新短期目标（距离上次更新需 ≥1 天）
- long_term_goal: 更新长期目标（距离上次更新需 ≥7 天）`;
}
