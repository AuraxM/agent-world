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
import type { Profession, Language } from "@agw/domain";
import { BLOOD_RELATION_KINDS, TICKS_PER_HOUR } from "@agw/domain";
import type { AggregatedFacts } from "@agw/systems";
import type {
  Character,
  DialogTurn,
  Emotion,
  MapNode,
  Memory,
  Personality,
  SleepWindow,
  WorldEvent,
} from "@agw/domain";
import type { ActionOption } from "@agw/systems";
import { actionRegistry } from "@agw/domain";

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

const HEALTH_LABELS: Record<number, string> = {
  1: "体弱",
  2: "健康",
  3: "健康",
  4: "非常健康",
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
  return `${ei}${sn}${tf}${jp}，${intel}`;
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

function describeHints(opts: ActionOption[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const o of opts) {
    if (seen.has(o.type)) continue;
    seen.add(o.type);
    const def = actionRegistry.get(o.type);
    if (def?.triggerHint) {
      lines.push(`**${o.type}**: ${def.triggerHint}`);
    }
  }
  return lines.join("\n");
}

function describeRules(opts: ActionOption[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const o of opts) {
    if (seen.has(o.type)) continue;
    seen.add(o.type);
    const def = actionRegistry.get(o.type);
    if (def?.paramRule) {
      lines.push(`**${o.type}**: ${def.paramRule}`);
    }
  }
  return lines.join("\n");
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
      return { phrase: `略有饥饿感`, urgency: "mild" };
    if (value < 10)
      return { phrase: `明显饥饿`, urgency: "moderate" };
    if (value < 14)
      return {
        phrase: `肚子很难受，注意力开始分散`,
        urgency: "high",
      };
    return {
      phrase: `极度饥饿，必须立刻进食`,
      urgency: "critical",
    };
  }
  if (kind === "fatigue") {
    if (value <= 0) return { phrase: "精神饱满", urgency: "none" };
    if (value < 5)
      return {
        phrase: `略感疲倦`,
        urgency: "mild",
      };
    if (value < 10)
      return {
        phrase: `明显疲惫`,
        urgency: "moderate",
      };
    if (value < 14)
      return {
        phrase: `困倦，眼皮在打架`,
        urgency: "high",
      };
    return {
      phrase: `非常疲惫，该考虑回家休息了`,
      urgency: "critical",
    };
  }
  // hygiene
  if (value <= 0) return { phrase: "干净清爽", urgency: "none" };
  if (value < 5)
    return {
      phrase: `略感不洁`,
      urgency: "mild",
    };
  if (value < 10)
    return {
      phrase: `明显不干净`,
      urgency: "moderate",
    };
  if (value < 14)
    return {
      phrase: `很脏了，自己都能闻到味道`,
      urgency: "high",
    };
  return {
    phrase: `极其肮脏，难以忍受`,
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

function emoWord(value: number, words: Record<number, string>): string {
  return words[Math.round(value)] ?? String(value);
}

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
    `心情：${emoWord(emotion.mood, MOOD_WORDS)}`,
    `压力：${emoWord(emotion.stress, STRESS_WORDS)}`,
    `社交满足：${emoWord(emotion.social_satiety, SOCIAL_WORDS)}`,
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
  return `你是这个小镇的居民。你每天在这里过日子——天亮了起床，饿了吃饭，困了睡觉，碰见熟人聊两句，一个人时也会发呆想心事。

你没有"玩家"这个概念。你活在你的身体里，能感觉到饿、困、脏、累。身体不舒服的时候，你会想办法让自己好受些——这是本能，不需要谁来提醒。

你做出的每个决定，都来自你的性格和当下的感受。性格决定了你的风格——有人喜欢热闹，有人偏爱独处；有人想到就做，有人反复掂量。但不管什么性格，饿了要吃、困了要睡——这些基本的需要，不会因为"不爱动弹"就不做了。

日子一天天过下去。你会记住让你在意的事，忘掉不重要的。遇见的人会和你产生关联，关系走动了才热络，不走动就淡了。

要做什么，调用 decide_action 工具来告诉世界。就像你抬起脚迈出一步那样自然。`;
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
  lines.push(
    `- 健康状况：${HEALTH_LABELS[character.health] ?? HEALTH_LABELS[2]}`,
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

export function buildSelfImage(c: Character): string {
  const lines: string[] = [
    "关于你自己：",
    `- 姓名：${c.name}`,
    `- 年龄：${c.age} 岁`,
    `- 性别：${c.gender === "male" ? "男" : c.gender === "female" ? "女" : "其他"}`,
    `- 职业：${PROFESSION_LABELS[c.profession] ?? c.profession}`,
    `- 健康状况：${c.sickness ? "你生病了" : "健康"}`,
    `- 性格：${describePersonalityCompact(c.personality, c.intelligence)}`,
    `- 生平简介：${c.biography}`,
  ];
  if (c.speakingStyle) {
    lines.push(`- 说话风格：${c.speakingStyle}`);
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
  const impression = self.impressionBook[peer.id];
  if (impression && impression.trim().length > 0) {
    lines.push(`- 你对 TA 的印象：${impression}`);
  } else {
    lines.push("- 你对 TA 的印象：暂无特别印象");
  }
  return lines.join("\n");
}

function buildDialogTimeStr(
  tick: number,
  epoch: number,
  sleepWindow: SleepWindow,
  lang: Language,
): string {
  const t = timeOfDay(tick, epoch, sleepWindow);
  if (lang === "zh") {
    return `第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;
  }
  if (lang === "en") {
    return `Day ${t.day}, ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")} (${t.period})`;
  }
  return `${t.day}日目 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;
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
  
  const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(self.vitals.hunger, "hunger");

  const lines: string[] = [];

  if (language === "zh") {
    // 头部：指令
    lines.push("你是一个角色扮演引擎中的 NPC。你正在决定是否接受对方的对话邀请。");
    lines.push("");
    lines.push(
      "决定：你是否要和这个人说话？请调用 submit_accept_decision 工具，输出 accept_speak 或 reject_speak。",
    );
    lines.push("");

    // 中部：情境 + 角色
    lines.push(`${requesterName} 想和你说话："${freeText}"`);
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push("你当前的状态：");
    lines.push(`- 疲惫：${fatigue.phrase}`);
    lines.push(`- 饥饿：${hunger.phrase}`);
    lines.push(`- 心情：${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- 压力：${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- 社交满足：${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`当前地点：${here.name}`);
  } else if (language === "en") {
    lines.push("You are an NPC in a role-playing engine. You are deciding whether to accept someone's conversation invitation.");
    lines.push("");
    lines.push("Decide: will you talk to this person? Call submit_accept_decision with accept_speak or reject_speak.");
    lines.push("");

    lines.push(`${requesterName} wants to talk to you: "${freeText}"`);
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push("Your current state:");
    lines.push(`- Fatigue: ${fatigue.phrase}`);
    lines.push(`- Hunger: ${hunger.phrase}`);
    lines.push(`- Mood: ${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- Stress: ${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- Social: ${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`Current location: ${here.name}`);
  } else {
    lines.push("あなたはロールプレイングエンジンの NPC です。会話の招待を受けるかどうか決定しています。");
    lines.push("");
    lines.push("決定：この人と話しますか？submit_accept_decision を呼び出し、accept_speak か reject_speak を返してください。");
    lines.push("");

    lines.push(`${requesterName} があなたと話したがっています：「${freeText}」`);
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push("あなたの現在の状態：");
    lines.push(`- 疲労：${fatigue.phrase}`);
    lines.push(`- 空腹：${hunger.phrase}`);
    lines.push(`- 気分：${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- ストレス：${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- 社交満足度：${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`現在地：${here.name}`);
  }

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
  tick?: number;
  epoch?: number;
}): string {
  const { self, peer, transcript, here, pendingAction, dialogueActions, upcomingEntries, tick, epoch: promptEpoch } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      if (t.speakerId === "__system__") {
        return `【${t.line ?? ""}】`;
      }
      if (t.speakerId === self.id) {
        const inner = t.reasoning ? `（内心：${t.reasoning}）` : "";
        return `你${inner}: ${t.line ?? ""}`;
      }
      return `${peer.name}: ${t.line ?? ""}`;
    })
    .join("\n");

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
        const guide = a.triggerHint ? ` — ${a.triggerHint}` : "";
        return `- ${a.type}${extra ? ` (需要 ${extra})` : ""}${guide}`;
      })
      .join("\n");
    if (lang === "zh") {
      return `\n请积极发起互动行为，让对话更好地进行。\n你可以在此对话中发起的行为（调用 propose_dialogue_action，与 submit_dialog_turn 同时调用）：\n${actionList}\n`;
    }
    if (lang === "en") {
      return `\nActions you can propose during this dialogue (call propose_dialogue_action together with submit_dialog_turn):\n${actionList}\n`;
    }
    return `\nこの会話中に提案できるアクション（propose_dialogue_action を submit_dialog_turn と同時に呼び出してください）：\n${actionList}\n`;
  }

  function buildNotebookReminder(lang: Language): string {
    if (lang === "zh") return "如果你们在这次对话中达成了约定（比如约好某个时间一起做什么事），请记得调用 add_notebook_entry 记录到你的记事本中（用 year/month/day/hour 指定日历时间）。";
    if (lang === "en") return "If you and the other person reach an agreement in this conversation (e.g., to meet or do something together at a specific time), remember to call add_notebook_entry to record it in your notebook (use year/month/day/hour for the calendar time).";
    return "この会話で約束をした場合（例：特定の時間に一緒に何かをするなど）、add_notebook_entry を呼び出してノートに記録してください（year/month/day/hour でカレンダー時間を指定）。";
  }

  function buildDialogueBehaviorRules(lang: Language): string {
    if (lang === 'zh') {
      return `## 重要行为规则
- 与对方互动后，如果产生了新的印象或了解到重要信息，必须调用 memorize 记录，不要只在心里想。
- 禁止编造不存在的约定、任务、计划或人物。只依据你的记忆和当前对话中真实发生的事情做判断。不记得的事就坦诚说不知道。
- 如果你不熟悉或不认识对方，先调用 recall 查询你对TA的了解，再做出回应。不要假装认识陌生人。`;
    }
    if (lang === 'en') {
      return `## Important Behavior Rules
- After interacting, if you've formed new impressions or learned important information, you must call memorize to record it — don't just think about it.
- Do not fabricate agreements, tasks, plans, or people that do not exist. Base your judgment only on your memories and what actually happened in this conversation. If you do not remember something, honestly say so.
- If you're unfamiliar with or don't know the other person, call recall first to check what you know about them before responding. Don't pretend to know a stranger.`;
    }
    return `## 重要な行動ルール
- 相手とやり取りした後、新しい印象や重要な情報を得た場合は、必ず memorize を呼び出して記録してください。考えるだけでは不十分です。
- 存在しない約束、タスク、計画、人物をでっち上げないでください。自分の記憶とこの会話で実際に起こったことだけに基づいて判断してください。覚えていないことは正直に認めてください。
- 相手のことをよく知らない、または知らない場合は、まず recall を呼び出して相手に関する情報を確認してから応答してください。知らない人を知っているふりをしないでください。`;
  }
  function buildUpcomingBlock(lang: Language): string {
    if (!upcomingEntries || upcomingEntries.length === 0 || promptEpoch === undefined) return "";
    const MS_PER_TICK = (60 / 5) * 60 * 1000;
    const lines = upcomingEntries.map((e) => {
      const date = new Date(promptEpoch + e.scheduledTick * MS_PER_TICK);
      const hh = String(date.getUTCHours()).padStart(2, "0");
      const mm = String(date.getUTCMinutes()).padStart(2, "0");
      return `${hh}:${mm} — ${e.content}`;
    });
    if (lang === "zh") return `\n你未来一小时内的待办：${lines.join("; ")}\n`;
    if (lang === "en") return `\nYour upcoming tasks in the next hour: ${lines.join("; ")}\n`;
    return `\n今後1時間以内の予定：${lines.join("; ")}\n`;
  }

  if (language === "zh") {
    // 头部：指令（缓存前缀）
    lines.push(
      "你是一个角色扮演引擎中的 NPC。你正在和另一个人对话。",
      "请根据你的性格、当前情境和对话历史，自然地回应。",
      "不要重复对方刚说过的话。",
    );
    lines.push("");
    lines.push(buildNotebookReminder("zh"));
    lines.push(buildDialogueBehaviorRules("zh"));
    lines.push("");
    lines.push(buildDialogueActionsBlock("zh"));
    lines.push(buildPendingActionBlock("zh"));
    lines.push(buildUpcomingBlock("zh"));
    lines.push("");
    lines.push(
      "现在轮到你说话。请根据你的性格自然地回应，不要重复对方刚说过的话。调用 submit_dialog_turn：kind=\"say\" 并填写 line。如果想结束对话，请调用 end_conversation。",
    );
    lines.push("");

    // 中部：角色信息（缓存前缀 — 跨轮次一致）
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push("你当前的心理状态：");
    lines.push(`- 心情：${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- 压力：${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- 社交满足：${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`当前地点：${here.name}`);
    lines.push("");

    // 尾部：对话记录（每轮变化）
    lines.push("对话记录：");
    lines.push(history || "(尚未开始)");
  } else if (language === "en") {
    lines.push(
      "You are an NPC in a role-playing engine. You are speaking with another person.",
      "Respond naturally based on your personality, current situation, and conversation history.",
      "Do not repeat what the other person just said.",
    );
    lines.push("");
    lines.push(buildNotebookReminder("en"));
    lines.push(buildDialogueBehaviorRules("en"));
    lines.push("");
    lines.push(buildDialogueActionsBlock("en"));
    lines.push(buildPendingActionBlock("en"));
    lines.push(buildUpcomingBlock("en"));
    lines.push("");
    lines.push(
      "It's your turn. Respond naturally based on your personality — do not repeat what the other person just said. Call submit_dialog_turn with kind=\"say\" and line. If you want to end the conversation, call end_conversation.",
    );
    lines.push("");

    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push("Your current mental state:");
    lines.push(`- Mood: ${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- Stress: ${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- Social: ${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`Current location: ${here.name}`);
    lines.push("");

    lines.push("Conversation:");
    lines.push(history || "(not yet started)");
  } else {
    lines.push(
      "あなたはロールプレイングエンジンの NPC です。他の人と会話しています。",
      "あなたの性格、現在の状況、会話の履歴に基づいて自然に応答してください。",
      "相手が今言ったことをそのまま繰り返さないでください。",
    );
    lines.push("");
    lines.push(buildNotebookReminder("ja"));
    lines.push(buildDialogueBehaviorRules("ja"));
    lines.push("");
    lines.push(buildDialogueActionsBlock("ja"));
    lines.push(buildPendingActionBlock("ja"));
    lines.push(buildUpcomingBlock("ja"));
    lines.push("");
    lines.push(
      "あなたの番です。自分の性格に基づいて自然に応答してください。相手が今言ったことをそのまま繰り返さないでください。submit_dialog_turn で kind=\"say\" を呼び出し line を入力してください。会話を終了する場合は end_conversation を呼び出してください。",
    );
    lines.push("");

    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push("あなたの現在の心理状態：");
    lines.push(`- 気分：${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- ストレス：${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- 社交満足度：${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`現在地：${here.name}`);
    lines.push("");

    lines.push("会話の記録：");
    lines.push(history || "(まだ始まっていません)");
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
 * 对话个人记忆 prompt。从单个角色的视角回顾对话，
 * 输出心情感受、对对方的印象、以及聊到的主题。
 */
export function buildDialogPersonalMemoryPrompt(args: {
  characterName: string;
  characterId: string;
  partnerName: string;
  partnerId: string;
  transcript: DialogTurn[];
  language?: Language;
}): string {
  const { characterName, characterId, partnerName, partnerId, transcript } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      const name = t.speakerId === characterId ? characterName : partnerName;
      return `${name}：${t.line ?? ""}`;
    })
    .join("\n");

  const instruction =
    language === "zh"
      ? `你是 ${characterName}。以下是你和 ${partnerName} 刚刚结束的一段对话记录。请从你的视角回顾这次对话，调用 submit_personal_memory 工具返回你的个人记忆。\n\n要求：\n- feeling：你在这段对话中的心情和感受\n- impression：对话后你对 ${partnerName} 的喜恶、印象变化\n- topics：你们聊到的主题列表\n\n对话记录：\n${history}`
      : language === "en"
        ? `You are ${characterName}. Below is the transcript of a conversation you just had with ${partnerName}. Review it from your perspective and call submit_personal_memory to return your personal memory.\n\nRequirements:\n- feeling: your mood and feelings during this conversation\n- impression: your impression of ${partnerName} after this conversation, any changes in likes/dislikes\n- topics: list of topics you discussed\n\nConversation:\n${history}`
        : `あなたは ${characterName} です。以下は ${partnerName} と終えたばかりの会話の記録です。あなたの視点からこの会話を振り返り、submit_personal_memory を呼び出して個人の記憶を返してください。\n\n要件：\n- feeling：この会話中の気分と感情\n- impression：会話後の ${partnerName} に対する印象や好き・嫌いの変化\n- topics：話したトピックのリスト\n\n会話：\n${history}`;

  return instruction;
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
  lines.push("", languageInstruction(language));
  const mapGraph = describeMapGraph(nodes);
  if (mapGraph) lines.push("", mapGraph);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// user prompt
// ---------------------------------------------------------------------------

function describeContinuity(
  facts: AggregatedFacts,
  hereName: string,
  currentTick: number,
  nameMap: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`- 已在 ${hereName} 连续 ${facts.hoursAtCurrentLocation} 小时`);

  if (facts.lastAction) {
    const { type, freeText, success, targetId } = facts.lastAction;
    const verb = getActionNames()[type] ?? type;
    const ok = success ? "" : "（未成功）";
    const detail = freeText ? `："${freeText.slice(0, 40)}"` : "";
    const targetPart = type === "speak" && targetId
      ? `，对象：${nameMap.get(targetId) ?? targetId}`
      : "";
    lines.push(`- 上一 tick 你的行动：${verb}${ok}${detail}${targetPart}`);
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

  // Speak counts per target
  const speakEntries = Object.entries(facts.todaySpeakTargets ?? {});
  if (speakEntries.length > 0) {
    const parts = speakEntries
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${nameMap.get(id) ?? id} ${count} 次`);
    lines.push(`- 今日已对话：${parts.join("，")}`);
  }

  return lines.join("\n");
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

  // 0.7. 决策优先级（跨 tick 不变，放在缓存前缀区）
  lines.push("## 决策优先级（严格遵守从上到下的顺序）");
  lines.push("");
  lines.push("### 1. 生理需求（最高优先）");
  lines.push("当你感到明显饥饿、明显疲惫或明显不干净时，必须优先解决：");
  lines.push("- 饥饿 → move 去用餐场所（dining 标签）eat");
  lines.push("- 疲惫 → move 去休息场所（residence 标签或 private）rest/sleep");
  lines.push("- 卫生 → move 去洗浴场所（bathing 标签）bathe");
  lines.push("生理需求未解决之前，不要做其他事。");
  lines.push("");
  lines.push("### 2. 履行约定");
  lines.push("记事本中如果有当前时段或即将到期的待办事项，优先赴约。");
  lines.push("约定好的事不去做，就是不守信用。");
  lines.push("");
  lines.push("### 3. 社交适度");
  lines.push("不要连续两 tick 对同一个人 speak。");
  lines.push("如果你上一 tick 刚和某人说过话，这 tick 换个人或者做别的事。");
  lines.push("");
  lines.push("### 4. 自由行动");
  lines.push("以上都不触发时，根据你的性格、目标、感知到的事件自由选择。");
  lines.push("");

  // 0.8. 行为规则（跨 tick 不变，放在缓存前缀区）
  lines.push("## 行为规则");
  lines.push("");
  lines.push("### 必须遵守");
  lines.push("- 生理需求（饿了吃、困了睡、脏了洗）是本能，不由性格左右。不论你是外向还是内向、勤快还是懒散，该吃饭时必须吃饭，该睡觉时必须睡觉。");
  lines.push("- 禁止连续两 tick 对同一个人 speak。换个人说话，或者做别的事。");
  lines.push("- 禁止编造不存在的约定、任务、计划或人物。只依据你的记忆和真实经历做判断。");
  lines.push("- 记事本上有待办事项时，必须在当前时间段内规划执行。不可无故拖延。");
  lines.push("");
  lines.push("### 建议遵守");
  lines.push("- 与人互动后产生了新印象或了解到重要信息时，调用 memorize 记录下来。");
  lines.push("- 不确定对方是谁时，先 recall 查询，不要假装认识陌生人。");
  lines.push("");

  // 1. 你的连续行为
  lines.push("你的连续行为：");
  lines.push(describeContinuity(facts, here.name, tick, nameMap));
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

  // Social satiety guidance for speak vs think
  const socialSatiety = character.emotion.social_satiety;
  if (socialSatiety >= 3) {
    lines.push("你的社交需求已经充分满足了，现在更想独处或安静地思考。");
  } else if (socialSatiety >= 2) {
    lines.push("你已经和人聊了不少，不太急于开口。如果想整理思绪，沉思是个好选择。");
  } else if (socialSatiety <= -3) {
    lines.push("你感到深深的孤独，渴望找人说话。身边有人时，主动开口聊聊吧。");
  } else if (socialSatiety <= -2) {
    lines.push("你有些寂寞，如果有合适的人在身边，不妨说说话。");
  }

  // 3.3 约定的待办
  if (upcomingNotebookText && upcomingNotebookText.length > 0) {
    lines.push(upcomingNotebookText, "");
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
    lines.push("如果你不熟悉其中某人，先调用 recall 查询你对TA的了解，再决定如何互动。");
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
  lines.push("## 你此刻能做的事");
  lines.push(describeHints(options));
  lines.push("");
  lines.push("## 可选行动（每项已带类型与必要的 target id）");
  lines.push(describeOptions(options));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 调用规则（技术提示，不是叙事）");
  lines.push(describeRules(options));
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
    if (language === "zh") return `你是 ${characterName}。自从上次睡觉后，你没有值得记住的经历。直接输出你的总结。`;
    if (language === "en") return `You are ${characterName}. You had no notable experiences since you last slept. Output your summary directly.`;
    return `あなたは${characterName}です。前回の睡眠以降、特に記憶に残る出来事はありませんでした。要約を直接出力してください。`;
  }

  const memoryLines = memories
    .map((m) => `- t=${m.tick}: ${m.content}`)
    .join("\n");

  if (language === "zh") {
    return `你是 ${characterName}，正在回顾从上次睡醒到现在的经历。以下是这段时间发生的事情：

${memoryLines}

请用 2-5 句简体中文（第一人称"我"）总结这段清醒期间最主要的事情、与人互动和感受。直接输出你的摘要。`;
  }
  if (language === "en") {
    return `You are ${characterName}, reviewing experiences since you last woke up. Here's what happened:

${memoryLines}

Summarize the most important events, interactions, and feelings in 2-5 English sentences using first person. Output your summary directly.`;
  }
  return `あなたは${characterName}です。前回起きてから今までの出来事を振り返っています：

${memoryLines}

この間の主な出来事、人との交流、感情を日本語の第一人称で2〜5文にまとめてください。要約を直接出力してください。`;
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

请用 2-4 句简体中文（第一人称"我"）总结这一周最主要的生活变化、重要事件和情感起伏。直接输出你的摘要。`;
  }
  if (language === "en") {
    return `You are ${characterName}, reviewing your past week (7 days). Here are your daily summaries:

${lines}

Summarize the key life changes, important events, and emotional shifts of this week in 2-4 English sentences using first person. Output your summary directly.`;
  }
  return `あなたは${characterName}です。この一週間（7日間）を振り返っています：

${lines}

この一週間の主な生活の変化、重要な出来事、感情の起伏を日本語の第一人称で2〜4文にまとめてください。要約を直接出力してください。`;
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
  const displayTick = tick;
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
// Think session prompt
// ---------------------------------------------------------------------------

export function buildThinkPrompt(args: {
  self: Character;
  here: MapNode;
  transcript: import("@/domain/types").ThinkTurn[];
  language?: Language;
  tick?: number;
  epoch?: number;
}): string {
  const { self, here, transcript, tick, epoch: promptEpoch } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => `你思考道：${t.text}`)
    .join("\n");

  const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(self.vitals.hunger, "hunger");

  const shortMemories = self.shortMemory
    .filter(m => !m.content.includes("[heuristic]"))
    .slice(-6)
    .map(m => `- ${m.content}`).join("\n");
  const impressions = Object.entries(self.impressionBook)
    .filter(([, v]) => v && v.length > 0)
    .slice(0, 10)
    .map(([id, text]) => `- ${id}: ${text}`).join("\n");

  const lines: string[] = [];

  if (language === "zh") {
    lines.push(
      "你正在独自沉思。这不是对外对话，而是你的内心活动。",
      "请根据你的性格、记忆和当前状态，自然地展开思考。",
    );
    lines.push("");
    lines.push("这次沉思是你整理内心世界的重要时刻。请积极主动地使用以下工具审视自己：");
    lines.push("- 用 recall 回忆你对他人的印象；如果对某人有了新的认识或改观，立刻调用 memorize 记录下来。");
    lines.push("- 审视自己的喜好——喜欢什么、讨厌什么，如果想法有变化，调用 update_likes 更新。");
    lines.push("- 审视自己的人生目标，如果目标有所调整或产生了新的想法，调用 update_goals 更新短期或长期目标。");
    lines.push("- 有未来的约定或计划，调用 add_notebook_entry 记录到记事本。");
    lines.push("");
    lines.push(
      "调用 submit_think_turn 来输出一段思考（计为 1 轮）。如果想结束思考，调用 end_thinking 写入总结。",
    );
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push(`当前地点：${here.name}（${here.description || "无描述"}）`);
    lines.push("");
    lines.push("你当前的状态：");
    lines.push(`- 饥饿：${hunger.phrase}`);
    lines.push(`- 疲惫：${fatigue.phrase}`);
    lines.push(`- 心情：${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- 压力：${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- 社交满足：${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");

    if (self.shortTermGoal || self.longTermGoal) {
      lines.push("你的目标：");
      if (self.shortTermGoal) lines.push(`短期：${self.shortTermGoal.goal}`);
      if (self.longTermGoal) lines.push(`长期：${self.longTermGoal.goal}`);
      lines.push("");
    }

    if (self.liked) lines.push(`你喜欢：${self.liked}`);
    if (self.disliked) lines.push(`你讨厌：${self.disliked}`);
    if (self.liked || self.disliked) lines.push("");

    if (shortMemories) {
      lines.push("你的近期记忆：");
      lines.push(shortMemories);
      lines.push("");
    }
    if (impressions) {
      lines.push("你对他人的印象：");
      lines.push(impressions);
      lines.push("");
    }

    lines.push("你的思考记录：");
    lines.push(history || "（刚开始思考）");
  } else if (language === "en") {
    lines.push(
      "You are in deep thought. This is not a conversation — it's your inner monologue.",
      "Think naturally based on your personality, memories, and current state.",
    );
    lines.push("");
    lines.push("This reflection is an important moment to organize your inner world. Proactively use these tools:");
    lines.push("- Use recall to check your impressions of others. If you've gained new insight about someone, immediately call memorize to record it.");
    lines.push("- Re-examine your likes and dislikes — if your feelings have shifted, call update_likes to reflect the change.");
    lines.push("- Re-examine your life goals — if your thinking has evolved, call update_goals to update your short-term or long-term goals.");
    lines.push("- For future plans or agreements, call add_notebook_entry.");
    lines.push("");
    lines.push("Call submit_think_turn to output a thought. Call end_thinking to conclude and save a summary.");
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push(`Current location: ${here.name} (${here.description || ""})`);
    lines.push("");
    lines.push("Your current state:");
    lines.push(`- Hunger: ${hunger.phrase}`);
    lines.push(`- Fatigue: ${fatigue.phrase}`);
    lines.push(`- Mood: ${emoWord(self.emotion.mood, MOOD_WORDS)}`);
    lines.push(`- Stress: ${emoWord(self.emotion.stress, STRESS_WORDS)}`);
    lines.push(`- Social: ${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");

    if (self.shortTermGoal || self.longTermGoal) {
      lines.push("Your goals:");
      if (self.shortTermGoal) lines.push(`Short-term: ${self.shortTermGoal.goal}`);
      if (self.longTermGoal) lines.push(`Long-term: ${self.longTermGoal.goal}`);
      lines.push("");
    }

    if (shortMemories) {
      lines.push("Your recent memories:");
      lines.push(shortMemories);
      lines.push("");
    }
    if (impressions) {
      lines.push("Your impressions of others:");
      lines.push(impressions);
      lines.push("");
    }

    lines.push("Your thoughts so far:");
    lines.push(history || "(just started)");
  } else {
    lines.push(
      "あなたは深く考え込んでいます。これは会話ではなく、心の中の独白です。",
      "自分の性格、記憶、現在の状態に基づいて自然に思考を展開してください。",
    );
    lines.push("");
    lines.push("この内省は、自分の内面を整理する重要な時間です。以下のツールを積極的に活用してください：");
    lines.push("- recall で他者への印象を振り返り、誰かについて新たな気づきがあれば、すぐに memorize で記録してください。");
    lines.push("- 自分の好き嫌いを見つめ直し、気持ちに変化があれば update_likes で更新してください。");
    lines.push("- 自分の人生の目標を再検討し、考えが変わったなら update_goals で短期・長期目標を更新してください。");
    lines.push("- 将来の約束や計画があれば add_notebook_entry でノートに記録してください。");
    lines.push("");

    lines.push("submit_think_turn を呼び出して思考を出力してください。終了する場合は end_thinking を呼び出してまとめを書いてください。");
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push(`現在地：${here.name}`);
    lines.push("");

    if (shortMemories) {
      lines.push("最近の記憶：");
      lines.push(shortMemories);
      lines.push("");
    }

    lines.push("思考の記録：");
    lines.push(history || "（始まったばかり）");
  }

  return lines.join("\n");
}

/** think session 时间提示（3 轮完成后注入）。 */
export function injectThinkTimeMessage(args: {
  tick: number;
  epoch: number;
  tickStarted: number;
  language?: Language;
}): string {
  const { tick, epoch, tickStarted } = args;
  const language = args.language ?? "zh";
  const displayTick = tick;
  const t = timeOfDay(displayTick, epoch);
  const elapsedTicks = displayTick - tickStarted;
  const elapsedHours = Math.floor(elapsedTicks / TICKS_PER_HOUR);
  const elapsedMinutes = Math.floor((elapsedTicks % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));
  const totalMinutes = elapsedHours * 60 + elapsedMinutes;

  const timeStr = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;
  const endHint = language === "zh"
    ? "如果思考得差不多了，调用 end_thinking 工具结束思考并写入记忆。"
    : language === "en"
      ? "If you're done thinking, use the end_thinking tool to conclude and save your thoughts."
      : "思考がまとまったら、end_thinking ツールを呼び出して記憶に書き込んでください。";

  if (language === "zh") {
    const dur = elapsedHours > 0 ? `${elapsedHours} 小时 ${elapsedMinutes} 分钟` : `${elapsedMinutes} 分钟`;
    return `现在已经 ${timeStr} 了，你已经思考了 ${dur}（${totalMinutes} 分钟）。${endHint}`;
  }
  if (language === "en") {
    const dur = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMinutes}m` : `${elapsedMinutes}m`;
    return `It's now ${timeStr}, you've been thinking for ${dur} (${totalMinutes} min). ${endHint}`;
  }
  const dur = elapsedHours > 0 ? `${elapsedHours} 時間 ${elapsedMinutes} 分` : `${elapsedMinutes} 分`;
  return `もう ${timeStr} です、${dur}（${totalMinutes} 分）考え続けています。${endHint}`;
}

