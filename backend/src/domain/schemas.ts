import { z } from "zod";
import {
  EVENT_CATEGORIES,
  EVENT_SCOPES,
  EVENT_SOURCES,
  NODE_TAGS,
  OBJECTIVE_RELATION_KINDS,
} from "./enums";

const RELATION_CHANGE_TYPES = [
  "become_partner",
  "end_partnership",
  "become_spouse",
  "end_friendship",
  "end_other_relative",
] as const;

/** Minimal tool definition shape matching OpenAI's ChatCompletionTool. */
export interface ActionToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Domain validation schemas (do NOT delete — used by DB, config, and runtime)
// ---------------------------------------------------------------------------

/** Personality 校验：MBTI 4 维 [-4, 4] 整数。 */
export const PersonalitySchema = z.object({
  ei: z.number().int().min(-4).max(4),
  sn: z.number().int().min(-4).max(4),
  tf: z.number().int().min(-4).max(4),
  jp: z.number().int().min(-4).max(4),
});

/** Vitals 校验：0..16 整数；cap 计数器可选，旧存档无此字段视为 0。 */
export const VitalsSchema = z.object({
  hunger: z.number().int().min(0).max(16),
  fatigue: z.number().int().min(0).max(16),
  hygiene: z.number().int().min(0).max(16),
  hungerCapTicks: z.number().int().nonnegative().optional(),
  fatigueCapTicks: z.number().int().nonnegative().optional(),
});

/** Emotion 校验：mood/social_satiety [-4..+4]，stress [0..4]。 */
export const EmotionSchema = z.object({
  mood: z.number().int().min(-4).max(4),
  stress: z.number().int().min(0).max(4),
  social_satiety: z.number().int().min(-4).max(4),
});

/** Sickness 校验：onsetTick/duration 整数，duration 120..840。 */
export const SicknessSchema = z.object({
  onsetTick: z.number().int().nonnegative(),
  duration: z.number().int().min(120).max(840),
});

export const NotebookEntrySchema = z.object({
  id: z.string(),
  scheduledTick: z.number().int().nonnegative(),
  content: z.string().min(1).max(500),
  createdAt: z.number().int().nonnegative(),
});

/** 单向关系。 */
export const RelationSchema = z.object({
  kinds: z.array(z.enum(OBJECTIVE_RELATION_KINDS)).min(1),
  since: z.number().int().nonnegative(),
  lastInteractionTick: z.number().int().nonnegative(),
});

export const MapNodeSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.enum(NODE_TAGS)),
  capacity: z.number().int().positive().nullable(),
  privacy: z.enum(["public", "semi", "private"]),
  visibleFromParent: z.boolean(),
  shortcuts: z.array(z.string()),
  isEntry: z.boolean(),
  travelCost: z.number().int().min(0).optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  spriteKey: z.string().optional(),
});

/** 已执行 Action 的内部表示（snake_case → camelCase 后的形态）。 */
export const ExecutedActionSchema = z.object({
  type: z.string(),
  actorId: z.string(),
  targetId: z.string().optional(),
  targetNodeId: z.string().optional(),
  freeText: z.string().optional(),
  reasoning: z.string().min(1).max(800),
  emotionTag: z.string().max(40).optional(),
  selfImportance: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  changeType: z.enum(RELATION_CHANGE_TYPES).optional(),
});

export const AgentThoughtSchema = z.object({
  worldId: z.string(),
  characterId: z.string(),
  tick: z.number().int().nonnegative(),
  action: ExecutedActionSchema,
  success: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});

export const WorldEventSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  tick: z.number().int().nonnegative(),
  category: z.enum(EVENT_CATEGORIES),
  description: z.string(),
  participants: z.array(z.string()),
  source: z.enum(EVENT_SOURCES),
  intensity: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  scope: z.enum(EVENT_SCOPES),
  nodeId: z.string().optional(),
  audienceCharacterId: z.string().optional(),
  duration: z.number().int().nonnegative(),
  suggestedActions: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Goal helper schema
// ---------------------------------------------------------------------------

export const GoalSchema = z.object({
  goal: z.string(),
  updatedAt: z.number().int().nonnegative(),
}).nullable();

// ---------------------------------------------------------------------------
// ── Read Tool Names ──
// ---------------------------------------------------------------------------

export const READ_PROFILE_TOOL = "read_profile";
export const READ_VITALS_TOOL = "read_vitals";
export const READ_EMOTION_TOOL = "read_emotion";
export const READ_MEMORIES_TOOL = "read_memories";
export const READ_GOALS_TOOL = "read_goals";
export const READ_ECONOMY_TOOL = "read_economy";
export const READ_RELATIONS_TOOL = "read_relations";
export const READ_CHARACTER_TOOL = "read_character";
export const READ_NOTEBOOK_TOOL = "read_notebook";
export const READ_MAP_TOOL = "read_map";
export const READ_COMPANIONS_TOOL = "read_companions";
export const READ_EVENTS_TOOL = "read_events";
export const READ_STATE_TOOL = "read_state";

// ── Write Tool Names ──
export const WRITE_DECISION_TOOL = "write_decision";
export const WRITE_DIALOG_TOOL = "write_dialog";
export const WRITE_PROPOSE_ACTION_TOOL = "write_propose_action";
export const WRITE_RESPOND_ACTION_TOOL = "write_respond_action";
export const END_DIALOG_TOOL = "end_dialog";
export const WRITE_MEMORY_TOOL = "write_memory";
export const DELETE_MEMORY_TOOL = "delete_memory";
export const WRITE_IMPRESSION_TOOL = "write_impression";
export const WRITE_NOTEBOOK_TOOL = "write_notebook";
export const WRITE_LIKE_TOOL = "write_like";
export const WRITE_DISLIKE_TOOL = "write_dislike";
export const WRITE_SHORT_TERM_GOAL_TOOL = "write_short_term_goal";
export const WRITE_LONG_TERM_GOAL_TOOL = "write_long_term_goal";
export const WRITE_RELATION_TOOL = "write_relation";
export const END_THINKING_TOOL = "end_thinking";

// ── Shared tool group arrays ──
export const ALL_READ_TOOLS = [
  READ_PROFILE_TOOL, READ_VITALS_TOOL, READ_EMOTION_TOOL, READ_MEMORIES_TOOL,
  READ_GOALS_TOOL, READ_ECONOMY_TOOL, READ_RELATIONS_TOOL, READ_CHARACTER_TOOL,
  READ_NOTEBOOK_TOOL, READ_MAP_TOOL, READ_COMPANIONS_TOOL, READ_EVENTS_TOOL,
  READ_STATE_TOOL,
] as const;

export const DECIDE_TERMINAL_TOOLS = [WRITE_DECISION_TOOL];
export const DIALOG_TERMINAL_TOOLS = [WRITE_DIALOG_TOOL, END_DIALOG_TOOL, WRITE_PROPOSE_ACTION_TOOL, WRITE_RESPOND_ACTION_TOOL];
export const THINK_TERMINAL_TOOLS = [WRITE_MEMORY_TOOL, DELETE_MEMORY_TOOL, END_THINKING_TOOL];

// ---------------------------------------------------------------------------
// ── Zod Parameter Schemas ──
// ---------------------------------------------------------------------------

export const ReadMemoriesParamsSchema = z.object({
  layer: z.enum(["short", "daily", "weekly"]).describe("要查询的记忆层"),
  time_range_start: z.number().int().optional().describe("时间范围起始 tick（含）"),
  time_range_end: z.number().int().optional().describe("时间范围结束 tick（含）"),
  target_id: z.string().optional().describe("筛选与特定角色相关的记忆"),
  limit: z.number().int().min(1).max(20).optional().default(10).describe("返回条数上限"),
});

export const ReadCharacterParamsSchema = z.object({
  character_id: z.string().describe("要查询的角色 ID"),
});

export const ReadRelationsParamsSchema = z.object({
  target_id: z.string().optional().describe("指定角色 ID，不填则返回所有关系"),
});

export const ReadEventsParamsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(10),
  category: z.string().optional().describe("事件类别筛选"),
});

export const WriteDecisionParamsSchema = z.object({
  action_type: z.string().describe("选择执行的动作类型"),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
  free_text: z.string().optional(),
  reason: z.string().optional(),
  amount: z.number().optional(),
});

export const WriteDialogParamsSchema = z.object({
  content: z.string().describe("你要说的话"),
  action_proposal: z.object({
    action_type: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
  }).optional().describe("对话中同时提议的动作"),
  action_response: z.object({
    accept: z.boolean(),
    reason: z.string().optional(),
  }).optional().describe("对对方动作提议的回应"),
});

export const WriteProposeActionParamsSchema = z.object({
  action_type: z.string().describe("提议的动作类型"),
  params: z.record(z.string(), z.unknown()).optional().describe("动作参数"),
});

export const WriteRespondActionParamsSchema = z.object({
  accept: z.boolean().describe("是否接受对方的动作提议"),
  reason: z.string().optional().describe("接受或拒绝的理由"),
});

export const EndDialogParamsSchema = z.object({
  summary: z.string().optional().describe("对话结束的简短总结"),
});

export const WriteMemoryParamsSchema = z.object({
  layer: z.enum(["short", "daily", "weekly"]).describe("写入哪一层"),
  content: z.string().describe("记忆内容"),
  importance: z.number().int().min(1).max(5).describe("重要程度 1-5"),
  merge_with_id: z.string().optional().describe("合并到已有记忆条目的 ID（替换其内容）"),
});

export const DeleteMemoryParamsSchema = z.object({
  layer: z.enum(["short", "daily", "weekly"]).describe("从哪一层删除"),
  memory_id: z.string().describe("要删除的记忆条目 ID"),
});

export const WriteImpressionParamsSchema = z.object({
  target_id: z.string().describe("目标角色 ID"),
  impression: z.string().describe("对目标角色的新印象"),
});

export const WriteNotebookParamsSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  content: z.string(),
});

export const WriteLikeParamsSchema = z.object({
  content: z.string().describe("喜欢的事物或人"),
});

export const WriteDislikeParamsSchema = z.object({
  content: z.string().describe("厌恶的事物或人"),
});

export const WriteShortTermGoalParamsSchema = z.object({
  goal: z.string().describe("新的短期目标"),
});

export const WriteLongTermGoalParamsSchema = z.object({
  goal: z.string().describe("新的长期目标"),
});

export const WriteRelationParamsSchema = z.object({
  target_id: z.string().describe("目标角色 ID"),
  action: z.enum(["add", "remove"]).describe("添加或移除关系"),
  kind: z.string().describe("关系类型"),
});

export const EndThinkingParamsSchema = z.object({
  summary: z.string().describe("本次记忆整理的总结"),
});

// ---------------------------------------------------------------------------
// ── Tool Builder Helpers ──
// ---------------------------------------------------------------------------

/**
 * Convert a Zod schema to OpenAI function-calling parameters format.
 * Handles the subset of Zod types used in our tool definitions.
 */
function zodToParameters(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as unknown as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return { type: "object", properties: {}, required: [], additionalProperties: false };

  const typeName = def.typeName as string;

  if (typeName === "ZodObject") {
    const shape = (def.shape as Record<string, unknown>) ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fieldDef = (fieldSchema as unknown as Record<string, unknown>)._def as Record<string, unknown> | undefined;
      if (!fieldDef) continue;

      const fieldTypeName = fieldDef.typeName as string;
      let innerSchema = fieldSchema as z.ZodType;
      let isOptional = false;

      // Unwrap ZodOptional
      if (fieldTypeName === "ZodOptional") {
        isOptional = true;
        innerSchema = (fieldDef.innerType as z.ZodType) ?? innerSchema;
      }

      // Unwrap ZodDefault
      const innerDef = (innerSchema as unknown as Record<string, unknown>)._def as Record<string, unknown> | undefined;
      if (innerDef?.typeName === "ZodDefault") {
        isOptional = true;
        innerSchema = (innerDef.innerType as z.ZodType) ?? innerSchema;
      }

      if (!isOptional) {
        required.push(key);
      }

      properties[key] = zodFieldToProperty(innerSchema);
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }

  return { type: "object", properties: {}, required: [], additionalProperties: false };
}

function zodFieldToProperty(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as unknown as Record<string, unknown>)._def as Record<string, unknown> | undefined;
  if (!def) return { type: "string" };

  const typeName = def.typeName as string;
  const description = def.description as string | undefined;

  if (typeName === "ZodString") {
    const prop: Record<string, unknown> = { type: "string" };
    if (description) prop.description = description;
    return prop;
  }

  if (typeName === "ZodNumber") {
    const prop: Record<string, unknown> = { type: "number" };
    if (description) prop.description = description;
    // Check for integer validation
    const checks = def.checks as Array<{ kind: string }> | undefined;
    if (checks?.some((c) => c.kind === "int")) {
      prop.type = "integer";
    }
    return prop;
  }

  if (typeName === "ZodBoolean") {
    const prop: Record<string, unknown> = { type: "boolean" };
    if (description) prop.description = description;
    return prop;
  }

  if (typeName === "ZodEnum") {
    const prop: Record<string, unknown> = { type: "string", enum: def.values };
    if (description) prop.description = description;
    return prop;
  }

  if (typeName === "ZodArray") {
    const prop: Record<string, unknown> = {
      type: "array",
      items: zodFieldToProperty(def.type as z.ZodType),
    };
    if (description) prop.description = description;
    return prop;
  }

  if (typeName === "ZodRecord") {
    const prop: Record<string, unknown> = { type: "object" };
    if (description) prop.description = description;
    return prop;
  }

  return { type: "string" };
}

function makeTool(name: string, description: string, schema: z.ZodType): ActionToolDef {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: zodToParameters(schema),
    },
  };
}

// ---------------------------------------------------------------------------
// ── Tool Set Builders ──
// ---------------------------------------------------------------------------

export function buildReadTools(): ActionToolDef[] {
  return [
    makeTool(READ_PROFILE_TOOL, "查询自己的基本信息：姓名、年龄、性别、职业、性格、语言风格、喜好、能力", z.object({})),
    makeTool(READ_VITALS_TOOL, "查询自己当前的生理状态：饥饿、疲劳、卫生", z.object({})),
    makeTool(READ_EMOTION_TOOL, "查询自己当前的情绪状态：心情、压力、社交饱足度", z.object({})),
    makeTool(READ_MEMORIES_TOOL, "按记忆层和时间范围查询记忆，按重要性降序再按时间降序返回", ReadMemoriesParamsSchema),
    makeTool(READ_GOALS_TOOL, "查询自己当前的短期和长期目标", z.object({})),
    makeTool(READ_ECONOMY_TOOL, "查询自己的经济状况：金钱、日常开销、经济警告", z.object({})),
    makeTool(READ_RELATIONS_TOOL, "查询自己与他人的关系标签和印象记录", ReadRelationsParamsSchema),
    makeTool(READ_CHARACTER_TOOL, "查询指定角色的公开信息：外观、身份、自己与该角色的关系和印象", ReadCharacterParamsSchema),
    makeTool(READ_NOTEBOOK_TOOL, "查询即将到来的个人预约事项", z.object({})),
    makeTool(READ_MAP_TOOL, "查看完整地图结构，标注自己当前所在位置", z.object({})),
    makeTool(READ_COMPANIONS_TOOL, "查看当前所在节点的其他角色", z.object({})),
    makeTool(READ_EVENTS_TOOL, "查询近期感知到的事件和活跃的全局事件", ReadEventsParamsSchema),
    makeTool(READ_STATE_TOOL, "查询自己当前正在执行的动作和进行中的对话状态", z.object({})),
  ];
}

export function buildDecideWriteTools(): ActionToolDef[] {
  return [
    makeTool(WRITE_DECISION_TOOL, "做出行动决定。收集足够信息后，选择一个行动执行", WriteDecisionParamsSchema),
    makeTool(WRITE_MEMORY_TOOL, "写入一条记忆到指定记忆层", WriteMemoryParamsSchema),
    makeTool(WRITE_IMPRESSION_TOOL, "记录或更新对某个角色的印象", WriteImpressionParamsSchema),
    makeTool(WRITE_NOTEBOOK_TOOL, "在记事本中添加一条预约事项", WriteNotebookParamsSchema),
    makeTool(WRITE_LIKE_TOOL, "添加一项喜好", WriteLikeParamsSchema),
    makeTool(WRITE_DISLIKE_TOOL, "添加一项厌恶", WriteDislikeParamsSchema),
    makeTool(WRITE_SHORT_TERM_GOAL_TOOL, "更新短期目标", WriteShortTermGoalParamsSchema),
    makeTool(WRITE_LONG_TERM_GOAL_TOOL, "更新长期目标", WriteLongTermGoalParamsSchema),
    makeTool(WRITE_RELATION_TOOL, "添加或移除与他人的关系标签", WriteRelationParamsSchema),
  ];
}

export function buildDialogWriteTools(): ActionToolDef[] {
  return [
    makeTool(WRITE_DIALOG_TOOL, "说一句话。可以在同一轮中附带动作提议或回应", WriteDialogParamsSchema),
    makeTool(WRITE_PROPOSE_ACTION_TOOL, "向对方提议一个动作（如赠送物品、邀请同行）", WriteProposeActionParamsSchema),
    makeTool(WRITE_RESPOND_ACTION_TOOL, "接受或拒绝对方提议的动作", WriteRespondActionParamsSchema),
    makeTool(END_DIALOG_TOOL, "结束当前对话", EndDialogParamsSchema),
    makeTool(WRITE_MEMORY_TOOL, "写入一条记忆到指定记忆层", WriteMemoryParamsSchema),
    makeTool(WRITE_IMPRESSION_TOOL, "记录或更新对某个角色的印象", WriteImpressionParamsSchema),
    makeTool(WRITE_NOTEBOOK_TOOL, "在记事本中添加一条预约事项", WriteNotebookParamsSchema),
    makeTool(WRITE_LIKE_TOOL, "添加一项喜好", WriteLikeParamsSchema),
    makeTool(WRITE_DISLIKE_TOOL, "添加一项厌恶", WriteDislikeParamsSchema),
    makeTool(WRITE_SHORT_TERM_GOAL_TOOL, "更新短期目标", WriteShortTermGoalParamsSchema),
    makeTool(WRITE_LONG_TERM_GOAL_TOOL, "更新长期目标", WriteLongTermGoalParamsSchema),
    makeTool(WRITE_RELATION_TOOL, "添加或移除与他人的关系标签", WriteRelationParamsSchema),
  ];
}

export function buildThinkWriteTools(): ActionToolDef[] {
  return [
    makeTool(WRITE_MEMORY_TOOL, "写入或合并一条记忆到指定记忆层", WriteMemoryParamsSchema),
    makeTool(DELETE_MEMORY_TOOL, "删除指定层中的一条记忆（低价值或已合并的）", DeleteMemoryParamsSchema),
    makeTool(END_THINKING_TOOL, "结束本次记忆整理并产出总结", EndThinkingParamsSchema),
    makeTool(WRITE_IMPRESSION_TOOL, "记录或更新对某个角色的印象", WriteImpressionParamsSchema),
    makeTool(WRITE_NOTEBOOK_TOOL, "在记事本中添加一条预约事项", WriteNotebookParamsSchema),
    makeTool(WRITE_LIKE_TOOL, "添加一项喜好", WriteLikeParamsSchema),
    makeTool(WRITE_DISLIKE_TOOL, "添加一项厌恶", WriteDislikeParamsSchema),
    makeTool(WRITE_SHORT_TERM_GOAL_TOOL, "更新短期目标", WriteShortTermGoalParamsSchema),
    makeTool(WRITE_LONG_TERM_GOAL_TOOL, "更新长期目标", WriteLongTermGoalParamsSchema),
    makeTool(WRITE_RELATION_TOOL, "添加或移除与他人的关系标签", WriteRelationParamsSchema),
  ];
}
