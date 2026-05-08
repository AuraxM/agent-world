/**
 * AUTO-GENERATED stub — will be overwritten by `pnpm gen:types` (Task 1.4).
 * Hand-maintained until the codegen pipeline is wired up. Do not add new exports
 * here; instead add them to backend/src/domain/{types,enums}.ts and regenerate.
 */

// ── from enums.ts ─────────────────────────────────────────────────────────────

export const TICKS_PER_HOUR = 5;

export type ObjectiveRelationKind =
  | "father" | "mother" | "son" | "daughter"
  | "older_brother" | "younger_brother" | "older_sister" | "younger_sister"
  | "other_relative"
  | "classmate" | "teacher" | "student"
  | "colleague" | "boss" | "subordinate"
  | "neighbor" | "landlord" | "tenant"
  | "spouse" | "partner" | "ex_partner"
  | "friend"
  | "acquaintance";

export type NodeTag =
  | "public" | "semi" | "private"
  | "indoor" | "outdoor"
  | "dining" | "education" | "residence" | "park" | "street" | "playground"
  | "bathing" | "quiet";

export type Privacy = "public" | "semi" | "private";

export type Profession =
  | "farmer" | "rancher" | "fisherman" | "lumberjack" | "hunter"
  | "chef" | "baker" | "brewer"
  | "blacksmith" | "carpenter" | "tailor"
  | "merchant" | "grocer" | "innkeeper"
  | "doctor" | "nurse" | "teacher" | "librarian"
  | "priest" | "mailman" | "mayor" | "student" | "unemployed";

export type Gender = "male" | "female" | "other";

export type CharacterOrigin = "local" | "visitor";

export type EventCategory =
  | "time" | "env" | "social" | "burst" | "quest" | "inner" | "system" | "action";

export type EventScope = "private" | "node" | "parent" | "children" | "global";

export type EventSource = "system" | "actor" | "player" | "inner";

// ── from types.ts ─────────────────────────────────────────────────────────────

/** 1 tick = 1/5 游戏小时（5 ticks/hour）。tick 0 是世界开始的整点。 */
export type Tick = number;

/** MBTI 4 维性格，每维范围 [-4, 4]（整数）。 */
export interface Personality {
  /** -4 极内向 ←→ +4 极外向 */
  ei: number;
  /** -4 极直觉 ←→ +4 极实感 */
  sn: number;
  /** -4 极情感 ←→ +4 极思考 */
  tf: number;
  /** -4 极感知 ←→ +4 极判断 */
  jp: number;
}

/**
 * 个体作息时间窗口（chronotype）。每个 NPC 有自己的睡眠时段，
 * 渔夫可能 20:00–04:00 睡，酒馆掌柜可能 02:00–10:00 睡。
 * 默认 22/8 即 22:00–06:00。
 */
export interface SleepWindow {
  /** 起床前一刻的睡眠开始小时 [0..23]。 */
  start: number;
  /** 持续小时 [4..12]。 */
  duration: number;
}

/** 能力。Stage 1 暂不深入用，仅作为决策上下文。 */
export interface Ability {
  kind: string;
  tier: number;
  exp: number;
}

/** 单条记忆。Stage 1 仅使用 short（FIFO 50）。 */
export interface Memory {
  /** 由 nanoid 或 uuid 生成 */
  id: string;
  /** 创建时的 tick */
  tick: Tick;
  /** 1–5，自评重要度（来自 LLM 输出的 self_importance） */
  importance: number;
  /** 自然语言记忆内容 */
  content: string;
  /** 关联事件/行动 id（可选） */
  refEventId?: string;
}

/** 记事本条目 */
export interface NotebookEntry {
  id: string;
  scheduledTick: Tick;
  content: string;
  createdAt: Tick;
}

/**
 * 单向关系：A 角色对 B 角色的认知。
 * 仅在 kinds 非空时存在；引擎在 kinds 清空后会自动删除条目。
 */
export interface Relation {
  /** 客观关系标签集合，至少 1 项。 */
  kinds: ObjectiveRelationKind[];
  /** 关系建立的 tick。 */
  since: Tick;
  /** 最近一次互动的 tick。 */
  lastInteractionTick: Tick;
}

/** 持续行动（驱动多 tick 的行为，如 sleep / 远途 move）。 */
export interface OngoingAction {
  type: string;
  startedAt: Tick;
  endsAt: Tick;
  description: string;
  /** 感知到 intensity ≥ 此值的事件即提前唤醒/中止。 */
  interruptThreshold: 1 | 2 | 3 | 4 | 5;
  /** move 专属：BFS 路径节点序列（含起点终点） */
  path?: string[];
  /** move 专属：当前已走到第几步 */
  stepIndex?: number;
  /** move 专属：到达后要执行的动作 */
  arrivalAction?: Action["arrivalAction"];
  /** move 专属：移动原因（中断时用于写记忆） */
  reason?: string;
}

/** 地图节点。 */
export interface MapNode {
  id: string;
  worldId: string;
  parentId: string | null;
  name: string;
  description: string;
  tags: NodeTag[];
  capacity: number | null;
  privacy: Privacy;
  visibleFromParent: boolean;
  /** 显式特殊通道：指向其他节点 id 的连接（如"密道"），始终 cost=0。 */
  shortcuts: string[];
  /**
   * 是否为"外部入口"节点（公交车站 / 码头 / 传送阵 …）。
   * 每张地图至少 1 个；中途投放新角色默认落在这里。
   */
  isEntry: boolean;
  /** 进入此节点所需 tick 数。默认 0（免费）；shortcuts 永远 cost=0。 */
  travelCost?: number;
  /** 在父节点画布上的格子坐标；缺失时前端走 fallback 自动布局。 */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** sprite/调色板 key（与 globals.css 的 --palette-<key>-* 对应）。 */
  spriteKey?: string;
}

/**
 * 数值化的生理指标。0..16 范围；进食/休息/洗浴时重置或减少。
 * 引擎用 vitals 计算行为冲动；prompt 把它转成定性文字给 LLM。
 *
 * cap 计数器（hungerCapTicks / fatigueCapTicks）记录该 vital 顶到 16 后
 * 持续了多少 tick，用于触发"长期忽视基本生理"的惩罚态——4 tick 起轻惩罚
 * （mood -1 + 失神 inner），8 tick 起重惩罚（mood -2）。
 * vital 一旦低于 16，对应 cap 计数器归零。可选字段，向后兼容。
 */
export interface Vitals {
  hunger: number;
  fatigue: number;
  hygiene: number;
  hungerCapTicks?: number;
  fatigueCapTicks?: number;
}

/**
 * 情绪状态。比 vitals 更主观；既受时间自然回归影响，
 * 也受社交事件（attack / help / gift / burst …）触发改变。
 */
export interface Emotion {
  /** 心情：-4..+4 */
  mood: number;
  /** 压力：0..4（不会变负） */
  stress: number;
  /** 社交满足：-4..+4 */
  social_satiety: number;
}

/** 疾病状态（运行时）。 */
export interface Sickness {
  onsetTick: Tick;
  duration: number; // ticks, 120–840 (1–7 game days)
}

/** 角色。 */
export interface Character {
  id: string;
  worldId: string;
  name: string;
  avatar?: string;
  origin: CharacterOrigin;
  age: number;
  gender: Gender;
  profession: Profession;
  /** 当前持有金额（整数）。 */
  money: number;
  /** 职业收入等级 0-3（0=无收入）。运行时从 manifest + profession 解析。 */
  incomeLevel: number;
  /** 免生存开销（未成年人 age<18 / 纯旅游型外来者）。 */
  expenseExempt: boolean;
  /** 角色个人档案。 */
  personalProfile: {
    /** 过往不同人生阶段的经历概述（第一人称）。内容随年龄而异。 */
    past: string;
    /** 当前个人信息简介（第一人称）：居住状况、日常节奏、当前关切。 */
    present: string;
  };
  locationId: string;
  personality: Personality;
  vitals: Vitals;
  emotion: Emotion;
  abilities: Ability[];
  /** 外貌 1-4 */
  appearance: number;
  /** 思维活跃度 1-4 */
  intelligence: number;
  /** 健康/体质 1-4 */
  health: number;
  /** 当前疾病状态（可选） */
  sickness?: Sickness;
  /** 说话口吻描述（可选，覆盖自动生成） */
  speakingStyle?: string;
  /** 当前参与的对话 ID 列表（发起者锁在其中，接受者可同时在多段对话） */
  activeConversationIds: string[];
  /** Stage 1: short memory FIFO 50 */
  shortMemory: Memory[];
  /** 中期日记忆：睡觉时由 LLM 压缩清醒期 shortMemory 生成 */
  dailyMemory: Memory[];
  /** 复用为周记忆：每 7 条日记忆压缩为 1 条周记忆 */
  longMemory: Memory[];
  /** key 是 targetId */
  relations: Record<string, Relation>;
  currentAction?: OngoingAction;
  /** 上次睡觉（压缩）的 tick；首次睡觉前为 0 */
  lastSleepTick: Tick;
  /** API 注入：最近一轮的完整 Action（含 reasoning），DB 不存。 */
  lastThought?: AgentThought;
  /**
   * 角色的活动处节点（工作/学习/日常活动地点）。
   * 来源是 character 配置文件，运行时由 tick 注入，不写入 DB。
   */
  activityNodeId?: string | null;
  /**
   * 角色的休息处节点（睡眠/私人时间地点）。
   * 来源是 character 配置文件，运行时由 tick 注入，不写入 DB。
   */
  restNodeId?: string | null;
  sleepWindow?: SleepWindow;
  /** 人物印象记录本：targetCharId → 自由文本印象 */
  impressionBook: Record<string, string>;
  notebook: NotebookEntry[];
  /** 短期目标（≥1 天更新间隔） */
  shortTermGoal: { goal: string; updatedAt: Tick } | null;
  /** 长期目标（≥7 天更新间隔） */
  longTermGoal: { goal: string; updatedAt: Tick } | null;
  /** 最喜欢的人或事（自由文本） */
  liked: string;
  /** 最讨厌的人或事（自由文本） */
  disliked: string;
}

/** 角色在某 tick 完成的一次决策快照（含完整 reasoning）。 */
export interface AgentThought {
  worldId: string;
  characterId: string;
  tick: Tick;
  action: Action;
  success: boolean;
  createdAt: number;
}

/** 对话内单轮快照（仅供 WorldEvent.dialogTranscript 使用） */
export interface DialogTurn {
  speakerId: string;
  kind: "say" | "action_result";
  line?: string;
  reasoning?: string;
}

/** 世界事件。 */
export interface WorldEvent {
  id: string;
  worldId: string;
  tick: Tick;
  category: EventCategory;
  description: string;
  participants: string[];
  source: EventSource;
  /** 1–5 强度 */
  intensity: 1 | 2 | 3 | 4 | 5;
  scope: EventScope;
  /** scope=private/node 时绑定到哪个节点；scope=node/parent/children 必填 */
  nodeId?: string;
  /** scope=private 时仅对该角色可见 */
  audienceCharacterId?: string;
  /** 持续 tick 数，过期前对感知队列保持有效 */
  duration: number;
  /** 给 LLM 的可选行动提示（不做强制） */
  suggestedActions?: string[];
  /** 对话事件专用：完整对话记录（其它 event 不填） */
  dialogTranscript?: DialogTurn[];
  /** 对话结束方式 */
  dialogEndedBy?: "natural" | "end_tool" | "hard_limit" | "turn_failure" | "passive";
}

/** update_relation 行动可选的语义子类型。 */
export type RelationChangeType =
  | "become_partner"
  | "end_partnership"
  | "become_spouse"
  | "end_friendship"
  | "end_other_relative";

/** 行动（LLM 输出 + 引擎执行体）。 */
export interface Action {
  type: string;
  actorId: string;
  targetId?: string;
  targetNodeId?: string;
  freeText?: string;
  /** give 行动金额 */
  amount?: number;
  reasoning: string;
  emotionTag?: string;
  /** 自评重要度 1–5，决定是否进入长期记忆 */
  selfImportance: 1 | 2 | 3 | 4 | 5;
  /** 仅在 type === "update_relation" 时使用 */
  changeType?: RelationChangeType;
  /** move 专属：为何去那里 */
  reason?: string;
  /** move 专属：到达后自动执行的动作 */
  arrivalAction?: {
    type: string;
    freeText?: string;
    targetId?: string;
    targetNodeId?: string;
  };
  /** 引擎标记：此 action 是 move 到达后自动触发的，execute 据此写到达记忆 */
  isArrivalAction?: boolean;
  /** isArrivalAction 为 true 时的目的地节点名（写记忆用） */
  arrivalNodeName?: string;
  /** 引擎内部标记：该 action 不写入 shortMemory（用于锁状态持续期间的自动 wait） */
  skipMemory?: boolean;
  /** 引擎内部标记：该 action 不经过 action registry 执行（用于持续行动占位） */
  skipExecution?: boolean;
  /** notebook: 预定日（0-based game day） */
  scheduled_day?: number;
  /** notebook: 预定小时 */
  scheduled_hour?: number;
  /** notebook: 预定分钟 */
  scheduled_minute?: number;
}

/** 世界元信息。 */
export interface World {
  id: string;
  name: string;
  mapId: string;
  currentTick: Tick;
  epoch: number;  // ms timestamp, world start datetime
  createdAt: number;
  updatedAt: number;
}
