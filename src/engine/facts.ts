/**
 * 聚合事实推导：把 agent_thoughts 历史与 character 当前状态汇总成 prompt 友好的
 * "自我观察"信息，让 LLM 看见自己的连续行为，避免在同一节点反复 social 的循环。
 *
 * 输入是只读的：
 *   - `character`：当前角色（locationId / lastThought 等）
 *   - `nodes`：本世界全部节点（用于 activity/rest node name lookup）
 *   - `currentTick`：本次决策的 fromTick（尚未推进）
 *   - `recentThoughts`：最近 N tick 的 thought 列表，**按 tick DESC 排序**
 *   - `activityNodeId`：来自 character 模板配置（loadCharacter().activityNodeId）
 *   - `restNodeId`：来自 character 模板配置（loadCharacter().restNodeId）
 *
 * 不查库、不写库；纯函数便于单测。
 */
import { TICKS_PER_HOUR, type ActionType } from "@/domain/enums";
import type {
  AgentThought,
  Character,
  MapNode,
  Tick,
} from "@/domain/types";

export interface AggregatedFacts {
  activityNodeId: string | null;
  activityNodeName: string | null;
  restNodeId: string | null;
  restNodeName: string | null;
  /** 自上次成功 move 起，已在当前节点停留的小时数；从未移动则等于 currentTick / TICKS_PER_HOUR。 */
  hoursAtCurrentLocation: number;
  lastAction?: {
    type: ActionType;
    freeText?: string;
    tick: Tick;
    success: boolean;
  };
  /** 最近一次成功 rest 的 tick；从未则 undefined。 */
  lastRestTick?: Tick;
  /** 最近一次成功 eat 的 tick；从未则 undefined。 */
  lastEatTick?: Tick;
  /** 最近一个游戏日（24h = TODAY_WINDOW ticks）内（不含本 tick）按 action type 计数。 */
  todayActionCounts: Partial<Record<ActionType, number>>;
}

export interface DeriveFactsInput {
  character: Character;
  nodes: MapNode[];
  currentTick: Tick;
  /** 按 tick DESC；调用方负责保证顺序与范围（推荐 [currentTick-48, currentTick) ）。 */
  recentThoughts: AgentThought[];
  activityNodeId: string | null;
  restNodeId: string | null;
}

const TODAY_WINDOW = 24 * TICKS_PER_HOUR; // 120 ticks = 1 game day

export function deriveAggregatedFacts(input: DeriveFactsInput): AggregatedFacts {
  const { character, nodes, currentTick, recentThoughts, activityNodeId, restNodeId } = input;

  const activityNodeName = activityNodeId
    ? (nodes.find((n) => n.id === activityNodeId)?.name ?? null)
    : null;
  const restNodeName = restNodeId
    ? (nodes.find((n) => n.id === restNodeId)?.name ?? null)
    : null;

  // 找最近一次成功 move：用于推算 hoursAtCurrentLocation
  let sinceTick = 0;
  let foundMove = false;
  for (const t of recentThoughts) {
    if (t.action.type === "move" && t.success) {
      sinceTick = t.tick;
      foundMove = true;
      break;
    }
  }
  const hoursAtCurrentLocation = foundMove
    ? Math.max(0, Math.floor((currentTick - sinceTick) / TICKS_PER_HOUR))
    : Math.floor(currentTick / TICKS_PER_HOUR);

  // 最近一次成功 rest（含 sleep）/ eat
  let lastRestTick: Tick | undefined;
  let lastEatTick: Tick | undefined;
  for (const t of recentThoughts) {
    if (
      lastRestTick === undefined &&
      (t.action.type === "rest" || t.action.type === "sleep") &&
      t.success
    ) {
      lastRestTick = t.tick;
    }
    if (lastEatTick === undefined && t.action.type === "eat" && t.success) {
      lastEatTick = t.tick;
    }
    if (lastRestTick !== undefined && lastEatTick !== undefined) break;
  }

  // 今日累计：tick >= currentTick - TODAY_WINDOW
  const todayActionCounts: Partial<Record<ActionType, number>> = {};
  const cutoff = currentTick - TODAY_WINDOW;
  for (const t of recentThoughts) {
    if (t.tick < cutoff) break; // recentThoughts 已 DESC 排序，越往后越旧
    todayActionCounts[t.action.type] =
      (todayActionCounts[t.action.type] ?? 0) + 1;
  }

  // lastAction：优先用 character.lastThought（store.loadWorld 自动注入）；
  // fallback 用 recentThoughts[0]（兼容测试中 character 没 lastThought 的情况）。
  const head = character.lastThought ?? recentThoughts[0];
  const lastAction = head
    ? {
        type: head.action.type,
        freeText: head.action.freeText,
        tick: head.tick,
        success: head.success,
      }
    : undefined;

  return {
    activityNodeId,
    activityNodeName,
    restNodeId,
    restNodeName,
    hoursAtCurrentLocation,
    lastAction,
    lastRestTick,
    lastEatTick,
    todayActionCounts,
  };
}
