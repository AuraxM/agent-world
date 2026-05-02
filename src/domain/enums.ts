/**
 * 封闭枚举：所有可被 LLM 选用的行动类型。
 * 24 种，分为默认（只动自己）和交互（动他人/物体/关系）两类。
 *
 * sleep vs nap：sleep 是 8 小时大行动，仅角色作息窗口内可推荐；
 * nap 是 4 小时小睡，作息窗口外白天补觉用，效果较弱。
 */
export const ACTION_TYPES = [
  // 默认（只动自己）—— 16 种
  "move", "wait", "observe", "rest", "eat", "read", "work", "use_ability",
  "sleep", "nap", "bathe", "exercise", "meditate", "write", "groom", "pace",
  // 交互（动他人/物体/关系）—— 8 种
  "speak", "interact_object", "interact_person",
  "attack", "flee", "help", "gift",
  "update_relation",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** 节点标签：用于地图节点的语义分类（影响可执行行动）。 */
export const NODE_TAGS = [
  "public", "semi", "private",
  "indoor", "outdoor",
  "dining", "education", "residence", "park", "street", "playground",
  "bathing", "quiet",
] as const;
export type NodeTag = (typeof NODE_TAGS)[number];

/** 节点隐私级别。 */
export type Privacy = "public" | "semi" | "private";

/** 客观关系类型（单向 A → B 的认知）。 */
export const OBJECTIVE_RELATION_KINDS = [
  // 血缘 9（不可被引擎或 LLM 删除）
  "father", "mother", "son", "daughter",
  "older_brother", "younger_brother", "older_sister", "younger_sister",
  "other_relative",
  // 社会 13
  "classmate", "teacher", "student",
  "colleague", "boss", "subordinate",
  "neighbor", "landlord", "tenant",
  "spouse", "partner", "ex_partner",
  "friend",
  // 偶遇 1（引擎自动管理）
  "acquaintance",
] as const;
export type ObjectiveRelationKind = (typeof OBJECTIVE_RELATION_KINDS)[number];

/** 血缘关系集合：这些 kind 永不可由 LLM 或引擎主动解除。 */
export const BLOOD_RELATION_KINDS: ReadonlySet<ObjectiveRelationKind> = new Set([
  "father", "mother", "son", "daughter",
  "older_brother", "younger_brother", "older_sister", "younger_sister",
  "other_relative",
]);

/** 事件类别。 */
export const EVENT_CATEGORIES = [
  "time", "env", "social", "burst", "quest", "inner", "system", "action",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** 事件可见范围（决定哪些 NPC 会被分发到该事件）。 */
export const EVENT_SCOPES = [
  "private", "node", "parent", "children", "global",
] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

/** 事件来源：系统自动 / 角色行动 / 玩家投放 / 内心触发。 */
export const EVENT_SOURCES = ["system", "actor", "player", "inner"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];
