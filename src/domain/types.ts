import type {
  ActionType,
  CharacterOrigin,
  EventCategory,
  EventScope,
  EventSource,
  Gender,
  NodeTag,
  ObjectiveRelationKind,
  Privacy,
  Profession,
} from "./enums";

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

/**
 * 单向关系：A 角色对 B 角色的认知。
 * 仅在 kinds 非空时存在；引擎在 kinds 清空后会自动删除条目。
 */
export interface Relation {
  /** 客观关系标签集合，至少 1 项。 */
  kinds: ObjectiveRelationKind[];
  /** 主观好感度，[-4..+4] 整数。 -4 极厌恶 → +4 极喜爱。 */
  affection: number;
  /** 自然语言备注，例如"小时候欺负过我" */
  note?: string;
  /** 关系建立的 tick。 */
  since: Tick;
  /** 最近一次互动的 tick；用于 acquaintance 衰减判定。 */
  lastInteractionTick: Tick;
}

/** 持续行动（驱动多 tick 的行为，如 sleep / 远途 move）。 */
export interface OngoingAction {
  type: ActionType;
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
  /** 第一人称生平简介，CoC 车卡风格。 */
  biography: string;
  locationId: string;
  personality: Personality;
  vitals: Vitals;
  emotion: Emotion;
  abilities: Ability[];
  /** Stage 1: short memory FIFO 50 */
  shortMemory: Memory[];
  /** Stage 1: 不使用 long memory，仅占位 */
  longMemory: Memory[];
  /** key 是 targetId */
  relations: Record<string, Relation>;
  currentAction?: OngoingAction;
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
  dialogEndedBy?: "natural" | "leave" | "hard_limit" | "turn_failure";
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
  type: ActionType;
  actorId: string;
  targetId?: string;
  targetNodeId?: string;
  freeText?: string;
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
    type: ActionType;
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
}

/** 世界全量快照。每 24 tick 持久化一次。 */
export interface WorldSnapshot {
  worldId: string;
  tick: Tick;
  nodes: MapNode[];
  characters: Character[];
  /** 最近 N 条事件，方便前端 dashboard 展示 */
  recentEvents: WorldEvent[];
}

/** 对话内单轮快照（仅供 WorldEvent.dialogTranscript 使用） */
export interface DialogTurn {
  speakerId: string;
  kind: "say" | "leave";
  line?: string;
  reasoning?: string;
}

/** 世界元信息。 */
export interface World {
  id: string;
  name: string;
  currentTick: Tick;
  createdAt: number;
  updatedAt: number;
}
