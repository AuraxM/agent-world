import type { Character, MapNode, Memory, WorldEvent } from "../domain";
import { MEMORY_CAPACITY, OBJECTIVE_RELATION_KINDS } from "../domain/enums";
// Import existing helpers from prompt.ts
import { buildMapView, timeOfDay } from "./prompt";
import { tickFromCalendar } from "../systems/notebook";

export interface ToolHandlerContext {
  self: Character;
  allCharacters: Character[];
  nodes: MapNode[];
  shops?: unknown[];
  itemDefs?: unknown[];
  tick: number;
  epoch: number;
  worldId: string;
  worldDescription?: string;
  perceptions?: Map<string, WorldEvent[]>;
  activeEventDefs?: unknown[];
  upcomingNotebookText?: string;
}

type HandlerResult = string | Record<string, unknown>;

// ── Read Handlers ──

export function handleReadProfile(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  const p = c.personality;

  // Qualitative MBTI labels
  const eiLabel = p.ei <= -3 ? "极度内向，喜欢独处"
    : p.ei <= -1 ? "偏内向"
    : p.ei <= 1 ? "内外向平衡"
    : p.ei >= 3 ? "极度外向，离不开人群"
    : "偏外向";
  const snLabel = p.sn <= -3 ? "极度直觉，天马行空"
    : p.sn <= -1 ? "偏直觉"
    : p.sn <= 1 ? "平衡"
    : p.sn >= 3 ? "极度务实，脚踏实地"
    : "偏务实";
  const tfLabel = p.tf <= -3 ? "极度感性，情绪驱动"
    : p.tf <= -1 ? "偏感性"
    : p.tf <= 1 ? "平衡"
    : p.tf >= 3 ? "极度理性，逻辑优先"
    : "偏理性";
  const jpLabel = p.jp <= -3 ? "极度随性，讨厌计划"
    : p.jp <= -1 ? "偏随性"
    : p.jp <= 1 ? "平衡"
    : p.jp >= 3 ? "极度自律，喜欢规划"
    : "偏自律";

  const intelLabels: Record<number, string> = {
    1: "头脑比较简单，不太擅长复杂思考",
    2: "和普通人一样，能处理日常事务",
    3: "头脑灵活，遇事容易想到不同的做法",
    4: "极其聪明，总能洞察事物的本质",
  };

  const restNode = ctx.nodes.find((n) => n.id === c.restNodeId);
  const activityNode = ctx.nodes.find((n) => n.id === c.activityNodeId);
  const sleepWindow = c.sleepWindow ?? { start: 22, duration: 8 };

  return {
    name: c.name,
    age: c.age,
    gender: c.gender,
    profession: c.profession,
    appearance: c.appearance,
    health_status: c.health >= 3 ? "健康" : c.health === 2 ? "一般" : c.sickness ? "患病" : "虚弱",
    personality: `${eiLabel}，${snLabel}，${tfLabel}，${jpLabel}`,
    intelligence: intelLabels[c.intelligence] ?? "",
    speaking_style: c.speakingStyle ?? "说话风格自然",
    past: c.personalProfile.past,
    present: c.personalProfile.present,
    liked: c.liked,
    disliked: c.disliked,
    abilities: c.abilities.map((a) => `${a.kind}（等级${a.tier}）`),
    sleep_window: `${sleepWindow.start}:00 — ${(sleepWindow.start + sleepWindow.duration) % 24}:00`,
    sleep_window_start: sleepWindow.start,
    sleep_window_duration: sleepWindow.duration,
    rest_node: restNode ? `${restNode.name}（${restNode.id}）` : (c.restNodeId ?? "无"),
    rest_node_id: c.restNodeId ?? null,
    activity_node: activityNode ? `${activityNode.name}（${activityNode.id}）` : (c.activityNodeId ?? "无"),
    activity_node_id: c.activityNodeId ?? null,
    current_location_id: c.locationId,
  };
}

export function handleReadVitals(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const v = ctx.self.vitals;
  const qualifyVital = (name: string, value: number): string => {
    if (value <= 2) return "正常";
    if (value <= 5) return `有点${name === "hunger" ? "饿" : name === "fatigue" ? "累" : "脏"}`;
    if (value <= 9) return `明显${name === "hunger" ? "饥饿" : name === "fatigue" ? "疲劳" : "需要洗浴"}`;
    if (value <= 13) return `非常${name === "hunger" ? "饥饿" : name === "fatigue" ? "疲惫" : "很脏"}`;
    return `极度${name === "hunger" ? "饥饿" : name === "fatigue" ? "疲惫" : "急需洗浴"}`;
  };
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    hunger: qualifyVital("hunger", v.hunger),
    fatigue: qualifyVital("fatigue", v.fatigue),
    hygiene: qualifyVital("hygiene", v.hygiene),
    hunger_value: round1(v.hunger),
    fatigue_value: round1(v.fatigue),
    hygiene_value: round1(v.hygiene),
    scale: "0-16（0=正常，16=极度）",
  };
}

export function handleReadEmotion(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const e = ctx.self.emotion;
  const moodLabel = e.mood <= -3 ? "非常低落" : e.mood <= -1 ? "有点低落" : e.mood <= 1 ? "平静" : e.mood >= 3 ? "非常好" : "不错";
  const stressLabel = e.stress >= 4 ? "极度紧张" : e.stress >= 3 ? "相当紧张" : e.stress >= 2 ? "有些压力" : e.stress >= 1 ? "轻微压力" : "轻松";
  const socialLabel = e.social_satiety <= -3 ? "深深孤独，渴望社交" : e.social_satiety <= -1 ? "有点孤单" : e.social_satiety <= 1 ? "社交需求正常" : e.social_satiety >= 3 ? "社交非常满足" : "社交比较满足";
  return {
    mood: moodLabel,
    stress: stressLabel,
    social_satiety: socialLabel,
    mood_raw: e.mood,
    stress_raw: e.stress,
    social_satiety_raw: e.social_satiety,
  };
}

export function handleReadMemories(
  args: { layer: string; time_range_start?: number; time_range_end?: number; target_id?: string; limit?: number },
  ctx: ToolHandlerContext,
): HandlerResult {
  const { layer, time_range_start, time_range_end, target_id, limit = 10 } = args;
  const c = ctx.self;

  let memories: Memory[];
  if (layer === "short") memories = [...c.shortMemory];
  else if (layer === "daily") memories = [...c.dailyMemory];
  else memories = [...c.longMemory];

  // Filter by time range
  if (time_range_start != null) memories = memories.filter((m) => m.tick >= time_range_start);
  if (time_range_end != null) memories = memories.filter((m) => m.tick <= time_range_end);

  // Filter by target character (simple keyword match on content)
  if (target_id) {
    memories = memories.filter((m) => m.content.includes(target_id));
  }

  // Sort: importance desc -> tick desc (most recent first among same importance)
  memories.sort((a, b) => b.importance - a.importance || b.tick - a.tick);

  const total = memories.length;
  memories = memories.slice(0, limit);

  return {
    layer,
    total_matching: total,
    returned: memories.length,
    capacity: MEMORY_CAPACITY[layer as keyof typeof MEMORY_CAPACITY] ?? "unknown",
    entries: memories.map((m) => ({
      id: m.id,
      tick: m.tick,
      importance: m.importance,
      content: m.content,
    })),
  };
}

export function handleReadGoals(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  return {
    short_term: c.shortTermGoal?.goal ?? "暂无短期目标",
    long_term: c.longTermGoal?.goal ?? "暂无长期目标",
    short_term_updated_at: c.shortTermGoal?.updatedAt ?? 0,
    long_term_updated_at: c.longTermGoal?.updatedAt ?? 0,
  };
}

export function handleReadEconomy(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  let warning = "";
  if (c.money <= 0) warning = "你身无分文！需要尽快赚钱";
  else if (c.money < 50) warning = "你的钱快花光了";
  return {
    money: c.money,
    income_level: c.incomeLevel,
    expense_exempt: c.expenseExempt,
    warning: warning || null,
  };
}

export function handleReadRelations(
  args: { target_id?: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const c = ctx.self;
  const targetId = args.target_id;

  const relationEntries = Object.entries(c.relations)
    .filter(([id]) => !targetId || id === targetId);

  const results = relationEntries.map(([charId, rel]) => {
    const targetChar = ctx.allCharacters.find((ch) => ch.id === charId);
    return {
      character_id: charId,
      character_name: targetChar?.name ?? "未知",
      relations: rel.kinds,
      since_tick: rel.since,
      last_interaction_tick: rel.lastInteractionTick,
      impression: c.impressionBook[charId] ?? "暂无印象",
    };
  });

  return { relations: results };
}

export function handleReadCharacter(
  args: { character_id: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const target = ctx.allCharacters.find((ch) => ch.id === args.character_id);
  if (!target) return { error: `未找到角色 ${args.character_id}` };

  const relationship = ctx.self.relations[args.character_id];
  const impression = ctx.self.impressionBook[args.character_id];

  return {
    name: target.name,
    age: target.age,
    gender: target.gender,
    profession: target.profession,
    appearance: target.appearance,
    location: ctx.nodes.find((n) => n.id === target.locationId)?.name ?? "未知",
    relationship_to_me: relationship ? relationship.kinds.join("、") : "无特殊关系",
    my_impression_of_them: impression ?? "暂无印象",
    currently_in_conversation: target.activeConversationIds.length > 0,
  };
}

export function handleReadNotebook(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const entries = ctx.self.notebook
    .filter((e) => e.scheduledTick >= ctx.tick)
    .sort((a, b) => a.scheduledTick - b.scheduledTick)
    .slice(0, 10);

  return {
    upcoming: entries.map((e) => ({
      id: e.id,
      scheduled_tick: e.scheduledTick,
      content: e.content,
    })),
  };
}

export function handleReadMap(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const here = ctx.nodes.find((n) => n.id === ctx.self.locationId);
  if (!here) return { error: "当前位置未知" };

  return {
    current_location: `${here.name}（${here.description}）`,
    current_node_id: here.id,
    full_map: buildMapView(here, ctx.nodes, ctx.shops as any[] | undefined),
  };
}

export function handleReadCompanions(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const here = ctx.self.locationId;
  const companions = ctx.allCharacters.filter(
    (ch) => ch.id !== ctx.self.id && ch.locationId === here,
  );

  return {
    location: ctx.nodes.find((n) => n.id === here)?.name ?? "未知",
    companions: companions.map((ch) => ({
      id: ch.id,
      name: ch.name,
      profession: ch.profession,
      is_in_conversation: ch.activeConversationIds.length > 0,
      ongoing_action: ch.currentAction?.description ?? null,
    })),
    count: companions.length,
  };
}

export function handleReadEvents(
  args: { limit?: number; category?: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const perceptionList = ctx.perceptions?.get(ctx.self.id) ?? [];
  let events = [...perceptionList];

  if (args.category) events = events.filter((e) => e.category === args.category);

  events.sort((a, b) => b.tick - a.tick);
  const limit = args.limit ?? 10;
  events = events.slice(0, limit);

  return {
    events: events.map((e) => ({
      id: e.id,
      tick: e.tick,
      category: e.category,
      description: e.description,
      intensity: e.intensity,
      participants: e.participants,
    })),
    active_global_events: (ctx.activeEventDefs as Array<{ name: string }>)?.map((ae) => ae.name) ?? [],
  };
}

export function handleReadState(_args: any, ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  const t = timeOfDay(ctx.tick, ctx.epoch, c.sleepWindow ?? { start: 22, duration: 8 });
  const hourStr = String(t.hour).padStart(2, "0");
  const minStr = String(t.minute).padStart(2, "0");
  return {
    current_action: c.currentAction
      ? { type: c.currentAction.type, description: c.currentAction.description, started_at: c.currentAction.startedAt, ends_at: c.currentAction.endsAt, remaining_ticks: c.currentAction.endsAt - ctx.tick }
      : null,
    active_conversations: c.activeConversationIds,
    pending_chat_invitations: [],
    current_time: `${hourStr}:${minStr}（${t.period}）`,
    hour: t.hour,
    minute: t.minute,
    period: t.period,
    is_sleep_hour: t.isSleepHour,
    tick: ctx.tick,
    day: t.day,
  };
}

// Handler registry (exported for the agent loop)
export const READ_HANDLERS: Record<string, (args: any, ctx: ToolHandlerContext) => HandlerResult> = {
  read_profile: handleReadProfile,
  read_vitals: handleReadVitals,
  read_emotion: handleReadEmotion,
  read_memories: handleReadMemories,
  read_goals: handleReadGoals,
  read_economy: handleReadEconomy,
  read_relations: handleReadRelations,
  read_character: handleReadCharacter,
  read_notebook: handleReadNotebook,
  read_map: handleReadMap,
  read_companions: handleReadCompanions,
  read_events: handleReadEvents,
  read_state: handleReadState,
};

// ── Write Handlers ──

export function handleWriteImpression(
  args: { target_id: string; impression: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.impressionBook[args.target_id] = args.impression.trim();
  return { success: true, action: `已更新对 ${args.target_id} 的印象` };
}

export function handleWriteNotebook(
  args: { year: number; month: number; day: number; hour: number; content: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const scheduledTick = tickFromCalendar(args.year, args.month, args.day, args.hour, ctx.epoch);
  const entry = {
    id: `nb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scheduledTick: scheduledTick ?? ctx.tick + 10,
    content: args.content,
    createdAt: ctx.tick,
  };
  ctx.self.notebook.push(entry);
  return { success: true, entry };
}

export function handleWriteLike(
  args: { content: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.liked = args.content;
  return { success: true, liked: args.content };
}

export function handleWriteDislike(
  args: { content: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.disliked = args.content;
  return { success: true, disliked: args.content };
}

export function handleWriteShortTermGoal(
  args: { goal: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.shortTermGoal = { goal: args.goal, updatedAt: ctx.tick };
  return { success: true, short_term_goal: args.goal };
}

export function handleWriteLongTermGoal(
  args: { goal: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.longTermGoal = { goal: args.goal, updatedAt: ctx.tick };
  return { success: true, long_term_goal: args.goal };
}

export function handleWriteRelation(
  args: { target_id: string; action: "add" | "remove"; kind: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const rel = ctx.self.relations[args.target_id];
  const BLOOD_RELATIONS = OBJECTIVE_RELATION_KINDS.filter((k) =>
    ["father", "mother", "son", "daughter", "older_brother", "younger_brother",
     "older_sister", "younger_sister", "other_relative"].includes(k),
  );

  if (args.action === "add") {
    // Prevent adding blood relations — they are innate, not acquired via tool
    if (BLOOD_RELATIONS.includes(args.kind as typeof BLOOD_RELATIONS[number])) {
      return { error: `不能通过工具添加血缘关系 ${args.kind}` };
    }
    if (rel) {
      if (!rel.kinds.includes(args.kind as any)) {
        rel.kinds.push(args.kind as any);
      }
    } else {
      ctx.self.relations[args.target_id] = {
        kinds: [args.kind as any],
        since: ctx.tick,
        lastInteractionTick: ctx.tick,
      };
    }
    return { success: true, action: `已添加与 ${args.target_id} 的 ${args.kind} 关系` };
  } else {
    if (rel) {
      // Protect blood relations from removal
      if (BLOOD_RELATIONS.includes(args.kind as typeof BLOOD_RELATIONS[number])) {
        return { error: `血缘关系 ${args.kind} 不可移除` };
      }
      rel.kinds = rel.kinds.filter((k) => k !== args.kind);
      if (rel.kinds.length === 0) delete ctx.self.relations[args.target_id];
    }
    return { success: true, action: `已移除与 ${args.target_id} 的 ${args.kind} 关系` };
  }
}

export function handleWriteMemory(
  args: { layer: string; content: string; importance: number; merge_with_id?: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const c = ctx.self;
  const layer = args.layer as "short" | "daily" | "weekly";
  const memoryArray = layer === "short" ? c.shortMemory : layer === "daily" ? c.dailyMemory : c.longMemory;
  const maxCap = MEMORY_CAPACITY[layer];

  if (args.merge_with_id) {
    // Merge: replace content of existing entry
    const existing = memoryArray.find((m) => m.id === args.merge_with_id);
    if (existing) {
      existing.content = args.content;
      existing.importance = args.importance;
      existing.tick = ctx.tick;
      return { success: true, merged: existing.id, layer };
    }
    // Fall through to create new if merge target not found
  }

  const memory: Memory = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tick: ctx.tick,
    importance: args.importance,
    content: args.content,
    layer,
  };

  memoryArray.push(memory);

  // FIFO eviction when over capacity
  while (memoryArray.length > maxCap) {
    memoryArray.shift();
  }

  return { success: true, created: memory.id, layer, remaining_capacity: maxCap - memoryArray.length };
}

export function handleDeleteMemory(
  args: { layer: string; memory_id: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const c = ctx.self;
  const layer = args.layer as "short" | "daily" | "weekly";
  const memoryArray = layer === "short" ? c.shortMemory : layer === "daily" ? c.dailyMemory : c.longMemory;

  const idx = memoryArray.findIndex((m) => m.id === args.memory_id);
  if (idx === -1) {
    return { error: `未在 ${layer} 层找到记忆 ${args.memory_id}` };
  }

  memoryArray.splice(idx, 1);
  return { success: true, deleted: args.memory_id, layer, remaining: memoryArray.length };
}

// Write handler registry
export const WRITE_HANDLERS: Record<string, (args: any, ctx: ToolHandlerContext) => HandlerResult> = {
  write_impression: handleWriteImpression,
  write_notebook: handleWriteNotebook,
  write_like: handleWriteLike,
  write_dislike: handleWriteDislike,
  write_short_term_goal: handleWriteShortTermGoal,
  write_long_term_goal: handleWriteLongTermGoal,
  write_relation: handleWriteRelation,
  write_memory: handleWriteMemory,
  delete_memory: handleDeleteMemory,
};
