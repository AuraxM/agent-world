/**
 * Prompt 工具函数（v3 — agent-loop 架构后）。
 *
 * 仅保留仍被使用的工具函数：角色画像构造、形象/情绪/生理描述、
 * 地图视图、时间/睡眠窗口计算、语言指令、对话时间注入、
 * 以及 accept-decision / dialog-summary 遗留 prompt builder。
 *
 * 系统 prompt 已迁移至 system-prompts.ts（Decide/Dialog/Think 各一份）。
 * 原 buildSystemPrompt / buildUserPrompt / buildDialogTurnPrompt 等已移除。
 */
import type { Profession, Language } from "../domain/index";
import { TICKS_PER_HOUR } from "../domain/index";
import type { Shop } from "../domain/index";
import type {
  Character,
  DialogTurn,
  Emotion,
  MapNode,
  Personality,
  SleepWindow,
} from "../domain/index";

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
  const ei = EI_LABELS[p.ei] ?? String(p.ei);
  const sn = SN_LABELS[p.sn] ?? String(p.sn);
  const tf = TF_LABELS[p.tf] ?? String(p.tf);
  const jp = JP_LABELS[p.jp] ?? String(p.jp);
  const intelRaw = INTELLIGENCE_LABELS[intelligence] ?? INTELLIGENCE_LABELS[2];
  // Strip leading "你" and trailing "。" from the intelligence label since
  // it's embedded in a personality summary where the subject is already "你".
  const intel = intelRaw.replace(/^你/, "").replace(/。$/, "");
  return `${ei}、${sn}、${tf}、${jp}，${intel}`;
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
    `社交：${emoWord(emotion.social_satiety, SOCIAL_WORDS)}`,
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
// language instructions
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

/**
 * 以当前节点为根，通过 BFS 重新绘制整个地图树。
 * parent/child + shortcuts 作为无向边；输出的缩进结构以当前位置为根。
 */
export function buildMapView(here: MapNode, nodes: MapNode[], shops?: Shop[]): string {
  if (nodes.length === 0) return "（地图为空）";

  const shopNodeIds = new Set((shops ?? []).map((s) => s.nodeId));

  // Build undirected adjacency (parent-child + shortcuts)
  const adj = new Map<string, string[]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    if (!adj.has(n.id)) adj.set(n.id, []);
    // Parent-child
    if (n.parentId) {
      adj.get(n.id)!.push(n.parentId);
      if (!adj.has(n.parentId)) adj.set(n.parentId, []);
      adj.get(n.parentId)!.push(n.id);
    }
    // Shortcuts
    for (const sid of n.shortcuts) {
      if (!adj.get(n.id)!.includes(sid)) adj.get(n.id)!.push(sid);
      if (!adj.has(sid)) adj.set(sid, []);
      if (!adj.get(sid)!.includes(n.id)) adj.get(sid)!.push(n.id);
    }
  }

  // BFS from here
  const bfsParent = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [here.id];
  visited.add(here.id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        bfsParent.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  // Group by BFS parent
  const childrenOf = new Map<string | null, MapNode[]>();
  for (const n of nodes) {
    if (!visited.has(n.id)) continue;
    const pid = bfsParent.get(n.id) ?? null;
    const arr = childrenOf.get(pid) ?? [];
    arr.push(n);
    childrenOf.set(pid, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }

  // Render tree
  const treeLines: string[] = [];
  const render = (n: MapNode, depth: number): void => {
    const indent = "  ".repeat(depth);
    const tagPart = n.tags.length > 0 ? n.tags.join("/") : n.privacy;
    const shopMark = shopNodeIds.has(n.id) ? " [店铺]" : "";
    treeLines.push(`${indent}- ${n.name} [${n.id}]（${tagPart}）${shopMark}`);
    for (const kid of childrenOf.get(n.id) ?? []) render(kid, depth + 1);
  };
  for (const root of childrenOf.get(null) ?? []) render(root, 0);

  // Shortcuts section (same format as describeMapGraph)
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
    if (!aNode || !bNode) { rendered.add(pair); continue; }
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

  let out = `查看地图（以你的位置 "${here.name}" 为根重绘，缩进=可达路径）：\n${treeLines.join("\n")}`;
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
  lines.push(`- 过往经历：${character.personalProfile.past}`);
  if (character.personalProfile.present) {
    lines.push(`- 当前状况：${character.personalProfile.present}`);
  }
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
  lines.push("");
  lines.push("你的欲望与恐惧是你行为的引擎——包括那些不那么光明的部分：");
  lines.push("- 你的短期/长期目标不只是待办事项。你为了达成它，可能会忽略别人的感受、走捷径、甚至扭曲事实。");
  lines.push("- 你喜欢的东西会让你想靠近、想占有、想保护——哪怕方法不漂亮，哪怕要排挤别人。");
  lines.push("- 你讨厌的东西会让你想远离、想破坏、想贬低——不需要给谁解释，也不需要公平。");
  lines.push("- 你的过往经历留下的不只是回忆，还有伤疤、执念和偏见。有时候你不是在回应眼前的人，而是在回应记忆中的人。");
  lines.push("- 你不一定在做「对的事」——你在做你觉得自己需要做的事。别人怎么看是别人的事。");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// dialog prompt builders
// ---------------------------------------------------------------------------

export function buildSelfImage(c: Character): string {
  const genderLabel = c.gender === "male" ? "男" : c.gender === "female" ? "女" : "其他";
  const profLabel = PROFESSION_LABELS[c.profession] ?? c.profession;
  const healthStatus = c.sickness ? "不佳（生病中）" : "健康";
  const personality = describePersonalityCompact(c.personality, c.intelligence);
  const styleSuffix = c.speakingStyle ? ` 你说话风格${c.speakingStyle}。` : "";
  const past = c.personalProfile.past.replace(/。+$/, "").trim();
  const present = c.personalProfile.present.replace(/。+$/, "").trim();
  const parts: string[] = [];
  parts.push(`你是${c.name}，一个${c.age}岁的${genderLabel}${profLabel}`);
  parts.push(`身体状况${healthStatus}，性格${personality}`);
  if (past) parts.push(`你曾经${past}`);
  if (present) parts.push(`你现在${present}`);
  if (c.shortTermGoal) parts.push(`短期目标：${c.shortTermGoal.goal}`);
  if (c.longTermGoal) parts.push(`长期目标：${c.longTermGoal.goal}`);
  if (c.liked) parts.push(`你喜欢：${c.liked}`);
  if (c.disliked) parts.push(`你讨厌：${c.disliked}`);
  if (styleSuffix) parts.push(styleSuffix);
  return parts.join("。") + "。";
}

// non-directional relation labels (for buildPeerImage)
const RELATION_SELF_LABELS: Record<string, string> = {
  classmate: "同学",
  teacher: "老师",
  student: "学生",
  neighbor: "邻居",
  landlord: "房东",
  tenant: "租客",
  friend: "朋友",
  acquaintance: "熟人",
  other_relative: "亲戚",
};

export function buildPeerImage(self: Character, peer: Character): string {
  const genderLabel = peer.gender === "male" ? "男" : peer.gender === "female" ? "女" : "其他";
  const profLabel = PROFESSION_LABELS[peer.profession] ?? peer.profession;
  const rel = self.relations[peer.id];
  const relationLine = rel && rel.kinds.length > 0
    ? `对方是你的${rel.kinds.map(k => DIRECTIONAL_KIND_LABELS[k] ?? RELATION_SELF_LABELS[k] ?? k).join("、")}。`
    : "";
  const impressionRaw = self.impressionBook[peer.id];
  const impression = impressionRaw?.trim().replace(/。+$/, "") ?? "";
  const impressionLine = impression.length > 0
    ? `你对TA的印象：${impression}。`
    : "你对TA暂无特别印象。";
  return `对方是${peer.name}，一个${peer.age}岁的${genderLabel}${profLabel}。${buildImage(peer)}。${relationLine}${impressionLine}`.trim();
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
  const { self, requesterName, freeText, here, peer } = args;
  const language = args.language ?? "zh";
  
  const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(self.vitals.hunger, "hunger");

  const lines: string[] = [];

  if (language === "zh") {
    // 头部：指令
    lines.push("你是一个角色扮演引擎中的 NPC。你正在决定是否接受对方的对话邀请。");
    lines.push("");
    lines.push(
      "决定：你是否要和这个人说话？请调用 submit_accept_decision 工具，输出 accept_chat 或 reject_chat。",
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
    lines.push(`- 社交：${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`当前地点：${here.name}`);
  } else if (language === "en") {
    lines.push("You are an NPC in a role-playing engine. You are deciding whether to accept someone's conversation invitation.");
    lines.push("");
    lines.push("Decide: will you talk to this person? Call submit_accept_decision with accept_chat or reject_chat.");
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
    lines.push("決定：この人と話しますか？submit_accept_decision を呼び出し、accept_chat か reject_chat を返してください。");
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
    lines.push(`- 社交：${emoWord(self.emotion.social_satiety, SOCIAL_WORDS)}`);
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(`現在地：${here.name}`);
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
  const { openerName, openerId, responderName, transcript } = args;
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

  const startT = timeOfDay(tickStarted, epoch);
  const startTimeStr = `${String(startT.hour).padStart(2, "0")}:${String(startT.minute).padStart(2, "0")}（${startT.period}）`;

  const totalMinutes = elapsedHours * 60 + elapsedMinutes;

  if (language === "zh") {
    if (totalMinutes === 0) {
      return `现在是 ${timeStr}。`;
    }
    const dur = elapsedHours > 0 ? `${elapsedHours} 小时 ${elapsedMinutes} 分钟` : `${elapsedMinutes} 分钟`;
    return `现在是 ${timeStr}。你们从 ${startTimeStr} 左右开始聊，已经过了大约 ${dur}。`;
  }
  if (language === "en") {
    if (totalMinutes === 0) {
      return `It's now ${timeStr}.`;
    }
    const dur = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMinutes}m` : `${elapsedMinutes}m`;
    return `It's now ${timeStr}. You've been talking for about ${dur}.`;
  }
  if (totalMinutes === 0) {
    return `今は ${timeStr} です。`;
  }
  const dur = elapsedHours > 0 ? `${elapsedHours} 時間 ${elapsedMinutes} 分` : `${elapsedMinutes} 分`;
  return `今は ${timeStr} です。約${dur}話しています。`;
}

