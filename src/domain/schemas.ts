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
 * Builder functions for dynamic action schemas.
 * Takes actionTypes from the world config so each world/map-pack can define
 * its own set of available actions.
 */
export const ACTION_TOOL_NAME = "submit_action";
export const SALVAGE_TOOL_NAME = "submit_action";

export function buildActionSchema(actionTypes: string[]) {
  if (actionTypes.length === 0) {
    throw new Error("buildActionSchema: actionTypes must not be empty");
  }
  const types = actionTypes as [string, ...string[]];
  return z.object({
    action_type: z.enum(types),
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
      action_type: z.enum(types),
      free_text: z.string().max(500).optional(),
      target_id: z.string().optional(),
      target_node_id: z.string().optional(),
    }).optional(),
  });
}
export type ActionPayload = z.infer<ReturnType<typeof buildActionSchema>>;

export function buildActionToolSchema(actionTypes: string[]) {
  return {
    type: "object" as const,
    properties: {
      action_type: { type: "string", enum: actionTypes },
      target_id: { type: "string", description: "目标角色或物体 id，可选。" },
      target_node_id: { type: "string", description: "目标节点 id（仅 move 等位移行动需要）。" },
      free_text: { type: "string", description: "自由文本（说话内容、行动具体描述）。speak 必填；其它行动选填。" },
      reasoning: { type: "string", description: "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。" },
      emotion_tag: { type: "string", description: "短情绪标签，例如 紧张 / 好奇 / 烦躁。" },
      self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评要不要长期记住。" },
      change_type: { type: "string", enum: [...RELATION_CHANGE_TYPES], description: "仅在 action_type=update_relation 时使用。" },
      reason: { type: "string", description: "仅 move：移动原因。" },
      arrival_action: {
        type: "object",
        description: "仅 move：到达目的地后要自动执行的动作。",
        properties: {
          action_type: { type: "string", enum: actionTypes },
          free_text: { type: "string", description: "说话内容或行动描述。" },
          target_id: { type: "string", description: "交互目标的 character id。" },
          target_node_id: { type: "string", description: "交互目标的节点 id。" },
        },
        required: ["action_type"],
        additionalProperties: false,
      },
    },
    required: ["action_type", "reasoning", "self_importance"],
    additionalProperties: false,
  };
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

/** 单向关系。 */
export const RelationSchema = z.object({
  kinds: z.array(z.enum(OBJECTIVE_RELATION_KINDS)).min(1),
  affection: z.number().int().min(-4).max(4),
  note: z.string().optional(),
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

// Dialog turn: kind=say|leave
export const DialogTurnSchema = z.object({
  kind: z.enum(["say", "leave"]),
  line: z.string().min(1).max(800).optional(),
  reasoning: z.string().min(1).max(300).optional(),
});
export type DialogTurnPayload = z.infer<typeof DialogTurnSchema>;

export const DIALOG_TURN_TOOL_NAME = "submit_dialog_turn";
export const DialogTurnToolSchema = {
  type: "object" as const,
  properties: {
    kind: { type: "string", enum: ["say", "leave"], description: "say=说一句话；leave=结束对话离开。" },
    line: { type: "string", description: "说的话（kind=say 时必填）。" },
    reasoning: { type: "string", description: "简短内心独白（可选）。" },
  },
  required: ["kind"],
  additionalProperties: false,
};

// Dialog summary
export const DialogSummarySchema = z.object({
  summary: z.string().min(1).max(500),
});
export type DialogSummaryPayload = z.infer<typeof DialogSummarySchema>;

export const DIALOG_SUMMARY_TOOL_NAME = "submit_dialog_summary";
export const DialogSummaryToolSchema = {
  type: "object" as const,
  properties: {
    summary: { type: "string", description: "1-2 句话总结这次对话的内容与氛围。" },
  },
  required: ["summary"],
  additionalProperties: false,
};

export function buildSalvageActionSchema(actionTypes: string[]) {
  const filtered = actionTypes.filter(
    (t) => t !== "speak" && t !== "accept_speak" && t !== "reject_speak" && t !== "leave_dialog",
  );
  if (filtered.length === 0) throw new Error("Salvage action types empty");
  const types = filtered as [string, ...string[]];
  const schema = z.object({
    action_type: z.enum(types),
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
      action_type: z.enum(types),
      free_text: z.string().max(500).optional(),
      target_id: z.string().optional(),
      target_node_id: z.string().optional(),
    }).optional(),
  });
  return { schema, types };
}

export function buildSalvageToolSchema(actionTypes: string[]) {
  const filtered = actionTypes.filter(
    (t) => t !== "speak" && t !== "accept_speak" && t !== "reject_speak" && t !== "leave_dialog",
  );
  return {
    type: "object" as const,
    properties: {
      action_type: { type: "string", enum: filtered },
      target_id: { type: "string", description: "目标角色 id，可选。" },
      target_node_id: { type: "string", description: "目标节点 id（仅 move 等位移行动需要）。" },
      free_text: { type: "string", description: "自由文本。" },
      reasoning: { type: "string", description: "内心独白。必须显式引用性格特征文字描述。" },
      emotion_tag: { type: "string", description: "短情绪标签。" },
      self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评重要度。" },
      change_type: { type: "string", enum: [...RELATION_CHANGE_TYPES], description: "仅在 action_type=update_relation 时使用。" },
      reason: { type: "string", description: "仅 move：移动原因。" },
      arrival_action: {
        type: "object",
        description: "仅 move：到达目的地后要自动执行的动作。",
        properties: {
          action_type: { type: "string", enum: filtered },
          free_text: { type: "string", description: "说话内容或行动描述。" },
          target_id: { type: "string", description: "交互目标的 character id。" },
          target_node_id: { type: "string", description: "交互目标的节点 id。" },
        },
        required: ["action_type"],
        additionalProperties: false,
      },
    },
    required: ["action_type", "reasoning", "self_importance"],
    additionalProperties: false,
  };
}
