/**
 * 模拟引擎主循环。
 *
 * 顺序：
 *   1. 加载世界 (loadWorld)
 *   2. status decay → 衍生 inner 事件
 *   3. 玩家排队的 pending 事件（Stage 1 暂为空）
 *   4. dispatchPerception → 谁看见了什么
 *   5. 收集"需要决策"的角色（感知队列非空）
 *   6. 并行调用 decide（Stage 1：可注入 mock）
 *   7. executeActions → 改状态 / 写记忆 / 衍生 action 事件
 *   8. 把所有 events 追加到 events_log
 *   9. currentTick++ → saveWorld
 *  10. 每 24 tick 写一次 snapshot
 *
 * decide 函数签名固定，保证后续 LLM 实现可以直接替换。
 */
import { buildActionContext, getAvailableActions } from "./actions";
import { executeActions } from "./execute";
import { deriveAggregatedFacts, type AggregatedFacts } from "./facts";
import { dispatchPerception } from "./perception";
import { decayAndDeriveStatuses } from "./status-decay";
import { timeOfDay } from "@/llm/prompt";
import {
  appendEventsLog,
  appendThoughts,
  loadRecentThoughts,
  loadWorld,
  persistSnapshot,
  saveWorld,
  type LoadedWorld,
} from "./store";
import { loadAllCharacters } from "@/config/loader";
import type {
  Action,
  Character,
  MapNode,
  WorldEvent,
} from "@/domain/types";
import type { ActionOption } from "./actions";

/**
 * 推 facts 时往回看的 tick 窗口。48 已远超"今日"24，足以容纳 lastRest/lastEat。
 */
const FACTS_LOOKBACK_TICKS = 48;

export interface DecideInput {
  character: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  perceived: WorldEvent[];
  options: ActionOption[];
  worldName: string;
  tick: number;
  /** 自我观察聚合：上一行动 / 已停留小时 / 距上次 rest / 今日累计计数 等。 */
  facts: AggregatedFacts;
}

export type DecideFn = (input: DecideInput) => Promise<Action>;

export interface TickOptions {
  /** 注入决策函数；不传则使用默认 LLM 实现（Stage 1 暂未接入 → fallback wait） */
  decide?: DecideFn;
  /** 跳过 LLM 决策，强制所有 NPC wait（用于无密钥的本地测试） */
  forceWait?: boolean;
}

export interface TickResult {
  worldId: string;
  /** 推进前的 tick */
  fromTick: number;
  /** 推进后的 tick */
  toTick: number;
  /** 本 tick 产生的所有事件 */
  events: WorldEvent[];
  /** 本 tick 决策需求列表（可能小于 NPC 数） */
  decisions: Array<{ characterId: string; action: Action; success: boolean }>;
}

/**
 * 默认决策函数：lazy import LLM 模块以避免引擎单测必须有 Anthropic SDK。
 * 注入测试时可通过 options.decide 直接绕过。
 */
const DEFAULT_DECIDE: DecideFn = async (input) => {
  const { llmDecide } = await import("@/llm/decide");
  return llmDecide(input);
};

function fallbackWait(c: Character): Action {
  return {
    type: "wait",
    actorId: c.id,
    reasoning: "（fallback）暂时没有想做的事。",
    selfImportance: 1,
  };
}

export async function tick(
  worldId: string,
  options: TickOptions = {},
): Promise<TickResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters } = loaded;
  const fromTick = world.currentTick;

  // 1. 衰减 + 越线 inner 事件
  const innerEvents = decayAndDeriveStatuses(characters, worldId, fromTick);

  // 2. （Stage 1 占位）外部排队事件
  const scheduledEvents: WorldEvent[] = [];

  const allCurrentEvents = [...innerEvents, ...scheduledEvents];

  // 3. 感知分发
  const perceptions = dispatchPerception(nodes, characters, allCurrentEvents);

  // 4. 收集需要决策者
  // Stage 1：所有角色每 tick 都决策，即使没有感知到事件——确保性格驱动可见
  const needers = characters.slice();

  // 5. 决策（并行）
  const decideFn = options.forceWait
    ? async (input: DecideInput) => fallbackWait(input.character)
    : (options.decide ?? DEFAULT_DECIDE);

  // 一次性 batch 读取 character 模板的 homeNodeId 映射，避免对每人重复读盘
  const homeMap = buildHomeMap();
  const sinceTick = Math.max(0, fromTick - FACTS_LOOKBACK_TICKS);
  const dayInfo = timeOfDay(fromTick);

  const actions = await Promise.all(
    needers.map(async (c) => {
      const ctx = buildActionContext(c, nodes, characters);
      const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
      const homeNodeId = homeMap.get(c.id) ?? null;
      const facts = deriveAggregatedFacts({
        character: c,
        nodes,
        currentTick: fromTick,
        recentThoughts,
        homeNodeId,
      });
      // 把 homeNodeId 也回填到内存对象，方便下游模块使用
      c.homeNodeId = homeNodeId;
      const opts = getAvailableActions(ctx, {
        facts,
        isSleepHour: dayInfo.isSleepHour,
      });
      try {
        return await decideFn({
          character: c,
          here: ctx.here,
          companions: ctx.companions,
          reachable: ctx.reachable,
          perceived: perceptions.get(c.id) ?? [],
          options: opts,
          worldName: world.name,
          tick: fromTick,
          facts,
        });
      } catch (err) {
        // LLM 异常 → wait + 写明失败原因
        const wait = fallbackWait(c);
        wait.reasoning = `LLM 调用失败：${
          err instanceof Error ? err.message : String(err)
        }`;
        return wait;
      }
    }),
  );

  // 6. 执行
  const result = executeActions({
    worldId,
    tick: fromTick,
    characters,
    nodes,
    actions,
  });

  const allEvents = [...allCurrentEvents, ...result.events];

  // 7. 写日志
  appendEventsLog(worldId, allEvents);

  // 8. 推进 tick + 持久化
  world.currentTick = fromTick + 1;
  saveWorld(loaded);

  // 9. 写入每个 NPC 的本轮思考（含完整 reasoning），供 profile 展示
  appendThoughts(
    worldId,
    result.resolvedActions.map((r) => ({
      characterId: r.action.actorId,
      tick: fromTick,
      action: r.action,
      success: r.success,
    })),
  );

  // 10. 每 24 tick 一个 snapshot（推进后才判断，所以 tick 从 0→1 时不写）
  if (world.currentTick > 0 && world.currentTick % 24 === 0) {
    persistSnapshot(loaded);
  }

  return {
    worldId,
    fromTick,
    toTick: world.currentTick,
    events: allEvents,
    decisions: result.resolvedActions.map((r) => ({
      characterId: r.action.actorId,
      action: r.action,
      success: r.success,
    })),
  };
}

/**
 * 从 configs/characters 一次性读出 id → homeNodeId 映射。
 * 失败（IO/解析）退化为空 Map：facts.homeNodeId 退化为 null，prompt 仍可工作。
 */
function buildHomeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.homeNodeId) m.set(tpl.id, tpl.homeNodeId);
    }
  } catch {
    // 配置目录不可读时静默：tick 仍能跑，只是 prompt 缺 home 信息
  }
  return m;
}

/** 暴露给测试：直接复用已加载的 LoadedWorld 而不查 DB（暂未对外） */
export type { LoadedWorld };
