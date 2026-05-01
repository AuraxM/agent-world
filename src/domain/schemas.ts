import { z } from "zod";
import {
  ACTION_TYPES,
  EVENT_CATEGORIES,
  EVENT_SCOPES,
  EVENT_SOURCES,
  NODE_TAGS,
  RELATION_KINDS,
  STATUS_KINDS,
} from "./enums";

/**
 * Action schema —— LLM 通过 tool-use 强制返回的结构。
 * 字段命名故意用 snake_case 与 Anthropic tool schema 习惯一致；
 * 引擎在 execute 阶段会把它转成 camelCase 的 Action 对象。
 */
export const ActionSchema = z.object({
  action_type: z.enum(ACTION_TYPES),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
  free_text: z.string().max(500).optional(),
  reasoning: z.string().min(1).max(800),
  emotion_tag: z.string().max(40).optional(),
  self_importance: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
});
export type ActionPayload = z.infer<typeof ActionSchema>;

/** Anthropic tool definition：直接喂给 SDK 即可。 */
export const ACTION_TOOL_NAME = "submit_action";
export const ActionToolInputSchema = {
  type: "object" as const,
  properties: {
    action_type: { type: "string", enum: [...ACTION_TYPES] },
    target_id: {
      type: "string",
      description: "目标角色或物体 id，可选。",
    },
    target_node_id: {
      type: "string",
      description: "目标节点 id（仅 move/flee 等位移行动需要）。",
    },
    free_text: {
      type: "string",
      description:
        "自由文本（说话内容、行动具体描述）。speak 必填；其它行动选填。",
    },
    reasoning: {
      type: "string",
      description:
        "内心独白。必须至少引用一项你自己的性格维度数值（例如：我的内向度 -80 让我不愿意搭话）。",
    },
    emotion_tag: {
      type: "string",
      description: "短情绪标签，例如 nervous / curious / annoyed。",
    },
    self_importance: {
      type: "integer",
      enum: [1, 2, 3, 4, 5],
      description: "1-5 自评要不要长期记住。",
    },
  },
  required: ["action_type", "reasoning", "self_importance"],
  additionalProperties: false,
};

/** Personality 校验。 */
export const PersonalitySchema = z.object({
  extraversion: z.number().min(-100).max(100),
  rationality: z.number().min(-100).max(100),
  ambition: z.number().min(-100).max(100),
  altruism: z.number().min(-100).max(100),
  curiosity: z.number().min(-100).max(100),
  aggression: z.number().min(-100).max(100),
  honesty: z.number().min(-100).max(100),
  stability: z.number().min(-100).max(100),
});

export const StatusSchema = z.object({
  kind: z.enum(STATUS_KINDS),
  level: z.enum(["light", "medium", "severe"]),
  since: z.number().int().nonnegative(),
});

export const RelationSchema = z.object({
  kind: z.enum(RELATION_KINDS),
  affinity: z.number().min(-100).max(100),
  note: z.string().optional(),
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
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  spriteKey: z.string().optional(),
});

/** 已执行 Action 的内部表示（snake_case → camelCase 后的形态）。 */
export const ExecutedActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
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
