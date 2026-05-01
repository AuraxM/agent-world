/**
 * 封闭枚举：所有可被 LLM 选用的行动类型。
 * Stage 1 取约 15 种核心动作（位移 / 等待 / 观察 / 言语 / 物体&人物互动 /
 * 能力使用 / 休息 / 工作 / 进食 / 攻击 / 逃避 / 帮助 / 馈赠 / 阅读 / 书写）。
 */
export const ACTION_TYPES = [
  "move",
  "wait",
  "observe",
  "speak",
  "interact_object",
  "interact_person",
  "use_ability",
  "rest",
  "work",
  "eat",
  "attack",
  "flee",
  "help",
  "gift",
  "read",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** 节点标签：用于地图节点的语义分类（影响可执行行动）。 */
export const NODE_TAGS = [
  "public",
  "semi",
  "private",
  "indoor",
  "outdoor",
  "dining",
  "education",
  "residence",
  "park",
  "street",
  "playground",
] as const;
export type NodeTag = (typeof NODE_TAGS)[number];

/** 节点隐私级别。 */
export type Privacy = "public" | "semi" | "private";

/** 状态种类：v0 仅追踪 hunger / fatigue 两个核心衰减项 + 几个情绪标签。 */
export const STATUS_KINDS = [
  "hungry",
  "fatigue",
  "bored",
  "excited",
  "curious",
  "lonely",
  "angry",
] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

/** 状态强度。 */
export type StatusLevel = "light" | "medium" | "severe";

/** 事件类别。 */
export const EVENT_CATEGORIES = [
  "time",
  "env",
  "social",
  "burst",
  "quest",
  "inner",
  "system",
  "action",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** 事件可见范围（决定哪些 NPC 会被分发到该事件）。 */
export const EVENT_SCOPES = [
  "private",
  "node",
  "parent",
  "children",
  "global",
] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

/** 事件来源：系统自动 / 角色行动 / 玩家投放 / 内心触发。 */
export const EVENT_SOURCES = ["system", "actor", "player", "inner"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** 关系类型（单向 A → B）。 */
export const RELATION_KINDS = [
  "stranger",
  "acquaintance",
  "friend",
  "close_friend",
  "lover",
  "crush",
  "rival",
  "enemy",
  "family",
] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
