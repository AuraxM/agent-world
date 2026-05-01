import type {
  ActionType,
  EventCategory,
  EventScope,
  EventSource,
  NodeTag,
  Privacy,
  RelationKind,
  StatusKind,
  StatusLevel,
} from "./enums";

/** 1 tick = 1 game hour. tick 0 是世界开始的整点。 */
export type Tick = number;

/** 性格 8 维，范围 [-100, 100]。 */
export interface Personality {
  extraversion: number;
  rationality: number;
  ambition: number;
  altruism: number;
  curiosity: number;
  aggression: number;
  honesty: number;
  stability: number;
}

/** NPC 当前持有的状态实例。 */
export interface Status {
  kind: StatusKind;
  level: StatusLevel;
  /** 状态开始的 tick；用于衰减/恢复计算 */
  since: Tick;
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

/** 单向关系：A 角色对 B 角色的认知。 */
export interface Relation {
  kind: RelationKind;
  /** -100..100 好感度 */
  affinity: number;
  /** 自然语言备注，例如"小时候欺负过我" */
  note?: string;
}

/** 持续行动（v0 占位，不实际驱动行为）。 */
export interface OngoingAction {
  type: ActionType;
  startedAt: Tick;
  endsAt: Tick;
  description: string;
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
  /** 显式特殊通道：指向其他节点 id 的连接（如"密道"） */
  shortcuts: string[];
  /**
   * 是否为"外部入口"节点（公交车站 / 码头 / 传送阵 …）。
   * 每张地图至少 1 个；中途投放新角色默认落在这里。
   */
  isEntry: boolean;
  /** 在父节点画布上的格子坐标；缺失时前端走 fallback 自动布局。 */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** sprite/调色板 key（与 globals.css 的 --palette-<key>-* 对应）。 */
  spriteKey?: string;
}

/**
 * 数值化的生理指标。每 tick 自动累加；进食/休息时重置。
 * 离散 Status[] 用于 LLM prompt 与 UI；vitals 用于引擎计算。
 */
export interface Vitals {
  /** 0..∞，>=5 medium, >=10 severe */
  hunger: number;
  /** 同上 */
  fatigue: number;
}

/** 角色。 */
export interface Character {
  id: string;
  worldId: string;
  name: string;
  avatar?: string;
  locationId: string;
  personality: Personality;
  vitals: Vitals;
  statuses: Status[];
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
   * 角色的"家"节点。来源是 character 配置文件，运行时由 facts 模块注入。
   * 不写入 DB（Stage 1 schema 不变）；Stage 2 迁移到 character 表字段。
   */
  homeNodeId?: string | null;
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
}

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

/** 世界元信息。 */
export interface World {
  id: string;
  name: string;
  currentTick: Tick;
  createdAt: number;
  updatedAt: number;
}
