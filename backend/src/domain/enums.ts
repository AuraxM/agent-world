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

/** 角色身份/职业（现代农业小镇背景）。 */
export const PROFESSIONS = [
  "farmer", "rancher", "fisherman", "lumberjack", "hunter",
  "chef", "baker", "brewer",
  "blacksmith", "carpenter", "tailor",
  "merchant", "grocer", "innkeeper",
  "doctor", "nurse", "teacher", "librarian",
  "priest", "mailman", "mayor", "student", "unemployed",
] as const;
export type Profession = (typeof PROFESSIONS)[number];

/** 职业 → 收入层级映射（0=none, 1=bare, 2=modest, 3=comfortable, 4=wealthy）。
 *  mod 自定义职业默认为 tier 0（无收入），可被 manifest.economy 覆盖。 */
export const PROFESSION_INCOME_TIERS: Record<string, number> = {
  doctor: 3, merchant: 3,
  farmer: 2, rancher: 2, fisherman: 2, lumberjack: 2, hunter: 2,
  chef: 2, baker: 2, brewer: 2,
  blacksmith: 2, carpenter: 2, tailor: 2,
  grocer: 2, innkeeper: 2,
  nurse: 2, teacher: 2, librarian: 2,
  priest: 2, mailman: 2, mayor: 2,
  student: 0, unemployed: 0,
};

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

export const CHARACTER_ORIGINS = ["local", "visitor"] as const;
export type CharacterOrigin = (typeof CHARACTER_ORIGINS)[number];

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
export const EVENT_SOURCES = ["system", "actor", "player", "inner", "think"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** 1 游戏小时 = 5 ticks。移动 1 步消耗 1 tick。 */
export const TICKS_PER_HOUR = 5;
