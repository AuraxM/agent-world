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

/**
 * 多 Tool action schema：每个 action 一个 tool，替代旧的单一 submit_action tool。
 *
 * - buildPerActionSchema() — 统一的 Zod 校验 schema（不含 action_type 字段，类型从 tool name 提取）
 * - buildActionTools() — 从 action registry + context 生成 ChatCompletionTool[]
 * - buildSalvageActionTools() — 同上但排除 speak 族（补救轮使用）
 */
import { actionRegistry, type ActionDefinition } from "@/domain/action-system";
import type { ActionContext } from "@/engine/actions";

/** action tool 名称前缀。每个 tool 名为 `action_<type>`。 */
export const ACTION_TOOL_PREFIX = "action_";

export function toolNameForAction(type: string): string {
  return `${ACTION_TOOL_PREFIX}${type}`;
}

export function actionTypeFromToolName(name: string): string | null {
  if (!name.startsWith(ACTION_TOOL_PREFIX)) return null;
  return name.slice(ACTION_TOOL_PREFIX.length);
}

/** 统一的 Zod 校验（所有 action tool 共用），不含 action_type。 */
export function buildPerActionSchema() {
  return z.object({
    target_id: z.string().optional(),
    target_node_id: z.string().optional(),
    free_text: z.string().max(500).optional(),
    reasoning: z.string().min(1).max(800),
    emotion_tag: z.string().max(40).optional(),
    self_importance: z.union([
      z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
    ]),
    change_type: z.enum(RELATION_CHANGE_TYPES).optional(),
    reason: z.string().max(200).optional(),
    arrival_action: z.object({
      action_type: z.string(),
      free_text: z.string().max(500).optional(),
      target_id: z.string().optional(),
      target_node_id: z.string().optional(),
    }).optional(),
  });
}

function buildToolParams(def: ActionDefinition) {
  const extraProps = def.extraParams ?? {};
  const extraRequired = def.extraRequired ?? [];
  return {
    type: "object" as const,
    properties: {
      reasoning: { type: "string", description: "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。" },
      self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评要不要长期记住。" },
      emotion_tag: { type: "string", description: "短情绪标签，例如 紧张 / 好奇 / 烦躁。" },
      ...extraProps,
    },
    required: ["reasoning", "self_importance", ...extraRequired],
    additionalProperties: false,
  };
}

/** 从 action registry + context 生成工具列表，每个 check() 通过的 action 一个 tool。 */
export function buildActionTools(ctx: ActionContext) {
  const tools: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> = [];
  for (const type of actionRegistry.types()) {
    const def = actionRegistry.get(type);
    if (!def) continue;
    if (!def.check(ctx)) continue;

    const hint = def.hint(ctx);
    const desc = Array.isArray(hint)
      ? hint.map((h) => h.hint).join("；")
      : hint;

    tools.push({
      type: "function" as const,
      function: {
        name: toolNameForAction(type),
        description: desc,
        parameters: buildToolParams(def),
      },
    });
  }
  return tools;
}

/** 补救轮工具列表：排除 speak 族。 */
export function buildSalvageActionTools(ctx: ActionContext) {
  return buildActionTools(ctx).filter((t) => {
    const actionType = actionTypeFromToolName(t.function.name);
    return (
      actionType !== "speak" &&
      actionType !== "accept_speak" &&
      actionType !== "reject_speak" &&
      actionType !== "leave_dialog"
    );
  });
}

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
// Dialog protocol schemas
// ---------------------------------------------------------------------------

// Accept decision: restricts output to accept_speak | reject_speak
export const AcceptDecisionSchema = z.object({
  action_type: z.enum(["accept_speak", "reject_speak"]),
  target_id: z.string().min(1),
  reasoning: z.string().min(1).max(400),
  self_importance: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
});
export type AcceptDecisionPayload = z.infer<typeof AcceptDecisionSchema>;

export const ACCEPT_TOOL_NAME = "submit_accept_decision";
export const AcceptToolSchema = {
  type: "object" as const,
  properties: {
    action_type: { type: "string", enum: ["accept_speak", "reject_speak"] },
    target_id: { type: "string", description: "邀请者的 character id。" },
    reasoning: { type: "string", description: "接受或拒绝的理由（内心独白）。" },
    self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评重要度。" },
  },
  required: ["action_type", "target_id", "reasoning", "self_importance"],
  additionalProperties: false,
};

// Dialog turn: kind=say only
export const DialogTurnSchema = z.object({
  kind: z.literal("say"),
  line: z.string().min(1).max(800),
  reasoning: z.string().min(1).max(300).optional(),
});
export type DialogTurnPayload = z.infer<typeof DialogTurnSchema>;

export const DIALOG_TURN_TOOL_NAME = "submit_dialog_turn";
export const DialogTurnToolSchema = {
  type: "object" as const,
  properties: {
    kind: { type: "string", enum: ["say"], description: "说一句话。" },
    line: { type: "string", description: "说的话。" },
    reasoning: { type: "string", description: "简短内心独白（可选）。" },
  },
  required: ["kind", "line"],
  additionalProperties: false,
};

export const END_CONVERSATION_TOOL_NAME = "end_conversation";
export const EndConversationToolSchema = {
  type: "object" as const,
  properties: {
    reasoning: { type: "string", description: "结束对话的理由（内心独白）。" },
    closing_line: { type: "string", description: "结束语（可选）。" },
  },
  required: ["reasoning"],
  additionalProperties: false,
};

// Propose dialogue action: 对话中发起双人交互行为
export const PROPOSE_DIALOGUE_ACTION_TOOL_NAME = "propose_dialogue_action";
export const ProposeDialogueActionSchema = z.object({
  action_type: z.string().min(1),
  target_id: z.string().min(1),
  amount: z.number().int().positive().optional(),
  free_text: z.string().max(300).optional(),
  reasoning: z.string().min(1).max(400),
});
export type ProposeDialogueActionPayload = z.infer<typeof ProposeDialogueActionSchema>;
export const ProposeDialogueActionToolSchema = {
  type: "object" as const,
  properties: {
    action_type: { type: "string", description: "要发起的交互行为类型。" },
    target_id: { type: "string", description: "交互目标角色 ID。" },
    amount: { type: "integer", description: "金额（give 需要）。" },
    free_text: { type: "string", description: "附言或说明（可选）。" },
    reasoning: { type: "string", description: "发起该行为的理由（内心独白）。" },
  },
  required: ["action_type", "target_id", "reasoning"],
  additionalProperties: true,
};

// Respond to dialogue action: 接受或拒绝对话中对方发起的交互行为
export const RESPOND_DIALOGUE_ACTION_TOOL_NAME = "respond_to_dialogue_action";
export const RespondDialogueActionSchema = z.object({
  response: z.enum(["accept", "reject"]),
  reasoning: z.string().min(1).max(400),
});
export type RespondDialogueActionPayload = z.infer<typeof RespondDialogueActionSchema>;
export const RespondDialogueActionToolSchema = {
  type: "object" as const,
  properties: {
    response: { type: "string", enum: ["accept", "reject"], description: "接受或拒绝对方发起的交互行为。" },
    reasoning: { type: "string", description: "接受或拒绝的理由（内心独白）。" },
  },
  required: ["response", "reasoning"],
  additionalProperties: false,
};

// Dialog summary
export const DialogSummarySchema = z.object({
  summary: z.string().min(1).max(500),
  memorize: z.array(z.object({ target_id: z.string().min(1), impression: z.string() })).optional(),
});
export type DialogSummaryPayload = z.infer<typeof DialogSummarySchema>;

export const DIALOG_SUMMARY_TOOL_NAME = "submit_dialog_summary";
export const DialogSummaryToolSchema = {
  type: "object" as const,
  properties: {
    summary: { type: "string", description: "1-2 句话总结这次对话的内容与氛围。" },
    memorize: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target_id: { type: "string", description: "要记录印象的角色 ID。" },
          impression: { type: "string", description: "对该角色的新印象。留空代表忘记。" },
        },
        required: ["target_id", "impression"],
      },
      description: "可选，对话后需要更新的印象列表。",
    },
  },
  required: ["summary"],
  additionalProperties: false,
};

// Memory summary (for sleep-triggered memory compression)
export const MemorySummarySchema = z.object({
  summary: z.string(),
});
export type MemorySummaryPayload = z.infer<typeof MemorySummarySchema>;

export const MEMORY_SUMMARY_TOOL_NAME = "submit_memory_summary";
export const MemorySummaryToolSchema = {
  type: "object" as const,
  properties: {
    summary: { type: "string", description: "记忆摘要（第一人称简体中文）" },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// End conversation
// ---------------------------------------------------------------------------

export const EndConversationSchema = z.object({
  reasoning: z.string().min(1).max(400),
  closing_line: z.string().max(800).optional(),
});

// ---------------------------------------------------------------------------
// Unified action decision tool (replaces per-action tools)
// ---------------------------------------------------------------------------

export const DECIDE_ACTION_TOOL_NAME = "decide_action";

export const DecideActionSchema = z.object({
  action_type: z.string().min(1),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
  free_text: z.string().max(500).optional(),
  amount: z.number().int().positive().optional(),
  reasoning: z.string().min(1).max(800),
  emotion_tag: z.string().max(40).optional(),
  self_importance: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
  change_type: z.enum(RELATION_CHANGE_TYPES).optional(),
  reason: z.string().max(200).optional(),
  arrival_action: z.object({
    action_type: z.string(),
    free_text: z.string().max(500).optional(),
    target_id: z.string().optional(),
    target_node_id: z.string().optional(),
  }).optional(),
}).passthrough();

export const DecideActionToolSchema = {
  type: "object" as const,
  properties: {
    action_type: {
      type: "string",
      description: "行动类型。可选值由引擎动态生成并注入 description。",
    },
    target_id: { type: "string", description: "目标角色 ID 或节点 ID（speak/move/give 需要）。" },
    target_node_id: { type: "string", description: "目标节点 ID（move 需要）。" },
    free_text: { type: "string", description: "对话内容（speak）或思考内容（think）。" },
    amount: { type: "integer", description: "金额（give 需要）。" },
    reasoning: { type: "string", description: "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。" },
    self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评要不要长期记住。" },
    emotion_tag: { type: "string", description: "短情绪标签，例如 紧张 / 好奇 / 烦躁。" },
    change_type: { type: "string", enum: RELATION_CHANGE_TYPES, description: "关系变更类型（仅 update_relation 需要）。" },
    reason: { type: "string", description: "移动原因（move 需要）。" },
    arrival_action: {
      type: "object",
      properties: {
        action_type: { type: "string" },
        free_text: { type: "string" },
        target_id: { type: "string" },
        target_node_id: { type: "string" },
      },
      description: "到达后自动执行的动作（move 可选）。",
    },
  },
  required: ["action_type", "reasoning", "self_importance"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Impression notebook tools
// ---------------------------------------------------------------------------

export const RECALL_TOOL_NAME = "recall";
export const RecallSchema = z.object({
  target_ids: z.array(z.string().min(1)).min(1).max(20),
});
export const RecallToolSchema = {
  type: "object" as const,
  properties: {
    target_ids: {
      type: "array",
      items: { type: "string" },
      description: "要查询的角色 ID 列表，可以一次查多个。",
    },
  },
  required: ["target_ids"],
  additionalProperties: false,
};

export const MEMORIZE_TOOL_NAME = "memorize";
export const MemorizeSchema = z.object({
  target_id: z.string().min(1),
  impression: z.string().max(1000),
});
export const MemorizeToolSchema = {
  type: "object" as const,
  properties: {
    target_id: { type: "string", description: "要记录印象的角色 ID。" },
    impression: { type: "string", description: "对此人的印象。留空代表忘记此人（删除印象）。" },
  },
  required: ["target_id", "impression"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Notebook entry tool
// ---------------------------------------------------------------------------

export const NOTEBOOK_TOOL_NAME = "add_notebook_entry";
export const NotebookSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  free_text: z.string().min(1).max(500),
});
export const NotebookToolSchema = {
  type: "object" as const,
  properties: {
    year: { type: "number", description: "约定时间的年份（如 2026）。" },
    month: { type: "number", description: "约定时间的月份 (1-12)。" },
    day: { type: "number", description: "约定时间的日期 (1-31)。" },
    hour: { type: "number", description: "约定时间的整点 (0-23)。" },
    free_text: { type: "string", description: "约定内容的简短描述。" },
  },
  required: ["year", "month", "day", "hour", "free_text"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Pre-sleep reflection tool
// ---------------------------------------------------------------------------

export const REFLECTION_TOOL_NAME = "submit_reflection";
export const ReflectionSchema = z.object({
  memorize: z.array(z.object({
    target_id: z.string().min(1),
    impression: z.string(),
  })).optional(),
  liked: z.string().max(500).optional(),
  disliked: z.string().max(500).optional(),
  short_term_goal: z.string().max(300).optional(),
  long_term_goal: z.string().max(300).optional(),
});
export const ReflectionToolSchema = {
  type: "object" as const,
  properties: {
    memorize: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target_id: { type: "string", description: "角色 ID。" },
          impression: { type: "string", description: "新的印象文本。空字符串代表忘记此人。" },
        },
        required: ["target_id", "impression"],
      },
      description: "本次反思中需要更新的印象列表（可选）。",
    },
    liked: { type: "string", description: "更新你最喜欢的人或事（可选）。" },
    disliked: { type: "string", description: "更新你最讨厌的人或事（可选）。" },
    short_term_goal: { type: "string", description: "更新你的短期目标（可选，每日最多一次）。" },
    long_term_goal: { type: "string", description: "更新你的长期目标（可选，每周最多一次）。" },
  },
  required: [],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Goal helper schema
// ---------------------------------------------------------------------------

export const GoalSchema = z.object({
  goal: z.string(),
  updatedAt: z.number().int().nonnegative(),
}).nullable();

// ---------------------------------------------------------------------------
// Tool builder for unified decide_action
// ---------------------------------------------------------------------------

import type { ChatCompletionTool } from "openai/resources/chat/completions";

export function buildDecideActionTool(ctx: ActionContext): ChatCompletionTool {
  const actionTypes: string[] = [];
  for (const type of actionRegistry.types()) {
    const def = actionRegistry.get(type);
    if (def && def.check(ctx)) actionTypes.push(type);
  }

  const typeDesc = actionTypes.map((t) => {
    const def = actionRegistry.get(t)!;
    const hint = def.hint(ctx);
    const hintText = Array.isArray(hint) ? hint.map((h: { hint: string }) => h.hint).join("；") : hint;
    return `- ${t}: ${hintText}`;
  }).join("\n");

  return {
    type: "function",
    function: {
      name: DECIDE_ACTION_TOOL_NAME,
      description: `提交你的行动决定。可用的 action_type：\n${typeDesc}`,
      parameters: {
        ...DecideActionToolSchema,
        properties: {
          ...DecideActionToolSchema.properties,
          action_type: {
            type: "string",
            enum: actionTypes,
            description: "你要执行的行动类型。",
          },
        },
      },
    },
  };
}
