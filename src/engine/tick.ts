/**
 * 模拟引擎主循环（v2 — 角色系统重设计后）。
 *
 * 顺序：
 *   1. 加载世界 (loadWorld)
 *   2. vitals 衰减 + emotion 演化 → 衍生 inner 事件
 *   3. 玩家排队的 pending 事件（Stage 1 暂为空）
 *   4. dispatchPerception → 谁看见了什么
 *   5. 对每个角色：
 *      a. 检查 ongoing action（睡觉/远途 move）：未完成且未被中断 → 自动 wait
 *      b. 否则进入 free-move 决策循环（cost=0 的 move 不结束本 tick，
 *         一次决策最多 5 步免费移动）
 *      c. 出循环后得到一个非 move（或受 cost 限制的 move）作为本 tick 行动
 *   6. executeActions → 改状态 / 写记忆 / 衍生 action 事件
 *   7. 关系自动管理：同节点互动 → ensure acquaintance；336 tick 未互动 → 衰减
 *   8. 把所有 events 追加到 events_log
 *   9. currentTick++ → saveWorld
 *  10. 每 24 tick 写一次 snapshot
 */
import { randomUUID } from "node:crypto";
import { buildActionContext, getAvailableActions } from "./actions";
import { executeActions } from "./execute";
import { deriveAggregatedFacts, type AggregatedFacts } from "./facts";
import { dispatchPerception } from "./perception";
import { decayVitals, evolveEmotions } from "./vitals-emotion";
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
  Relation,
  WorldEvent,
} from "@/domain/types";
import type { ActionOption } from "./actions";

const FACTS_LOOKBACK_TICKS = 48;
const MAX_FREE_MOVES = 5;
/** 14 游戏日 = 14 * 24 = 336 tick */
const ACQUAINTANCE_DECAY_TICKS = 336;

export interface DecideInput {
  character: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  perceived: WorldEvent[];
  options: ActionOption[];
  worldName: string;
  tick: number;
  facts: AggregatedFacts;
}

export type DecideFn = (input: DecideInput) => Promise<Action>;

export interface TickOptions {
  decide?: DecideFn;
  forceWait?: boolean;
}

export interface TickResult {
  worldId: string;
  fromTick: number;
  toTick: number;
  events: WorldEvent[];
  decisions: Array<{ characterId: string; action: Action; success: boolean }>;
}

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

function makeInnerEvent(args: {
  worldId: string;
  tick: number;
  charId: string;
  description: string;
  intensity?: 1 | 2 | 3 | 4 | 5;
}): WorldEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    worldId: args.worldId,
    tick: args.tick,
    category: "inner",
    description: args.description,
    participants: [args.charId],
    source: "inner",
    intensity: args.intensity ?? 1,
    scope: "private",
    audienceCharacterId: args.charId,
    duration: 1,
  };
}

export async function tick(
  worldId: string,
  options: TickOptions = {},
): Promise<TickResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters } = loaded;
  const fromTick = world.currentTick;
  const allEvents: WorldEvent[] = [];
  const allDecisions: Array<{
    characterId: string;
    action: Action;
    success: boolean;
  }> = [];

  // 1. vitals decay
  allEvents.push(...decayVitals({ characters, worldId, tick: fromTick }));

  // 2. emotion evolution
  const hasCompanions = new Map<string, boolean>();
  for (const c of characters) {
    const peers = characters.filter(
      (p) => p.id !== c.id && p.locationId === c.locationId,
    );
    hasCompanions.set(c.id, peers.length > 0);
  }
  allEvents.push(
    ...evolveEmotions({ characters, worldId, tick: fromTick, hasCompanions }),
  );

  // 3. 占位：外部排队事件
  const scheduledEvents: WorldEvent[] = [];
  const eventsForPerception = [...allEvents, ...scheduledEvents];

  // 4. 感知分发
  const perceptions = dispatchPerception(
    nodes,
    characters,
    eventsForPerception,
  );

  // 5. 准备决策上下文公共变量
  const homeMap = buildHomeMap();
  const sinceTick = Math.max(0, fromTick - FACTS_LOOKBACK_TICKS);
  const dayInfo = timeOfDay(fromTick);
  const decideFn = options.forceWait
    ? async (input: DecideInput) => fallbackWait(input.character)
    : (options.decide ?? DEFAULT_DECIDE);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // 6. 处理每个角色（顺序，不能并行：free move 改 location 影响后续 perception 推断）
  const actionsForExecution: Action[] = [];

  for (const c of characters) {
    // 6a. 持续行动检查
    if (c.currentAction && fromTick < c.currentAction.endsAt) {
      const perceived = perceptions.get(c.id) ?? [];
      const interrupt = perceived.find(
        (e) => e.intensity >= c.currentAction!.interruptThreshold,
      );
      if (interrupt) {
        // 中断：部分恢复 + 内心事件 + 进入正常决策流程
        const halfDone = Math.floor(
          (fromTick - c.currentAction.startedAt) / 2,
        );
        if (c.currentAction.type === "sleep") {
          c.vitals.fatigue = Math.max(0, c.vitals.fatigue - halfDone);
        }
        allEvents.push(
          makeInnerEvent({
            worldId,
            tick: fromTick,
            charId: c.id,
            description: `被「${interrupt.description}」打断。`,
            intensity: 2,
          }),
        );
        c.currentAction = undefined;
      } else {
        // 仍在持续：自动 wait，不调用 LLM
        if (fromTick % 4 === 0) {
          allEvents.push(
            makeInnerEvent({
              worldId,
              tick: fromTick,
              charId: c.id,
              description: `仍在 ${c.currentAction.description}。`,
            }),
          );
        }
        const waitAction: Action = {
          type: "wait",
          actorId: c.id,
          reasoning: `持续行动中：${c.currentAction.description}。`,
          selfImportance: 1,
        };
        actionsForExecution.push(waitAction);
        allDecisions.push({
          characterId: c.id,
          action: waitAction,
          success: true,
        });
        continue;
      }
    }

    // 6b. ongoing action 到期：先结算最终效果，再让 LLM 自由决策
    if (c.currentAction && fromTick === c.currentAction.endsAt) {
      if (c.currentAction.type === "sleep") {
        c.vitals.fatigue = 0;
      }
      c.currentAction = undefined;
    }

    // 6c. free move 链
    let freeMovesUsed = 0;
    let action: Action;

    while (true) {
      const ctx = buildActionContext(c, nodes, characters);
      const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
      const homeNodeId = homeMap.get(c.id) ?? null;
      c.homeNodeId = homeNodeId;
      const facts = deriveAggregatedFacts({
        character: c,
        nodes,
        currentTick: fromTick,
        recentThoughts,
        homeNodeId,
      });
      const opts = getAvailableActions(ctx, {
        facts,
        isSleepHour: dayInfo.isSleepHour,
      });

      try {
        action = await decideFn({
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
        action = fallbackWait(c);
        action.reasoning = `LLM 调用失败：${
          err instanceof Error ? err.message : String(err)
        }`;
      }

      if (action.type !== "move" || !action.targetNodeId) break;

      const targetNode = nodeById.get(action.targetNodeId);
      const isShortcut = ctx.here.shortcuts.includes(action.targetNodeId);
      const cost = isShortcut ? 0 : (targetNode?.travelCost ?? 0);

      if (cost > 0) {
        // 远途 move：占位 ongoing，本 tick 不再决策（execute 不会真正搬位）
        c.currentAction = {
          type: "move",
          startedAt: fromTick,
          endsAt: fromTick + cost,
          description: `前往 ${targetNode?.name ?? action.targetNodeId} 途中`,
          interruptThreshold: 5,
        };
        // 远途：将 action 转成 wait 让本 tick 不真的发生瞬移
        action = {
          type: "wait",
          actorId: c.id,
          reasoning: `开始前往 ${targetNode?.name ?? action.targetNodeId}，途中需 ${cost} 小时。`,
          selfImportance: action.selfImportance,
        };
        break;
      }

      if (freeMovesUsed >= MAX_FREE_MOVES) {
        allEvents.push(
          makeInnerEvent({
            worldId,
            tick: fromTick,
            charId: c.id,
            description: "想继续走但只能停下想想。",
          }),
        );
        // 转成 wait 结束本轮
        action = {
          type: "wait",
          actorId: c.id,
          reasoning: "本 tick 已用完免费移动配额。",
          selfImportance: 1,
        };
        break;
      }

      // 应用免费 move：直接搬位 + 抛事件
      const fromNode = ctx.here;
      c.locationId = action.targetNodeId;
      freeMovesUsed++;
      allEvents.push({
        id: `evt-${randomUUID().slice(0, 8)}`,
        worldId,
        tick: fromTick,
        category: "action",
        description: `${c.name} 从 ${fromNode.name} 来到 ${targetNode?.name ?? action.targetNodeId}。`,
        participants: [c.id],
        source: "actor",
        intensity: 1,
        scope: "node",
        nodeId: c.locationId,
        duration: 1,
      });
    }

    actionsForExecution.push(action);
    allDecisions.push({
      characterId: c.id,
      action,
      success: true,
    });
  }

  // 7. 执行（move 已在 free-move 循环里处理；execute 内部的 move 分支保留兼容）
  // 仅把"非 move（或带 cost 的 move 已被改写为 wait）"喂进去
  const execResult = executeActions({
    worldId,
    tick: fromTick,
    characters,
    nodes,
    actions: actionsForExecution,
  });
  allEvents.push(...execResult.events);

  // 同步 success/reason 到 allDecisions（execute 可能 fail）
  for (let i = 0; i < execResult.resolvedActions.length; i++) {
    const r = execResult.resolvedActions[i];
    if (allDecisions[i] && allDecisions[i].action === r.action) {
      allDecisions[i].success = r.success;
    }
  }

  // 8. 关系自动管理
  manageRelations(characters, fromTick, allEvents);

  // 9. 持久化
  appendEventsLog(worldId, allEvents);
  world.currentTick = fromTick + 1;
  saveWorld(loaded);
  appendThoughts(
    worldId,
    execResult.resolvedActions.map((r) => ({
      characterId: r.action.actorId,
      tick: fromTick,
      action: r.action,
      success: r.success,
    })),
  );

  if (world.currentTick > 0 && world.currentTick % 24 === 0) {
    persistSnapshot(loaded);
  }

  return {
    worldId,
    fromTick,
    toTick: world.currentTick,
    events: allEvents,
    decisions: allDecisions,
  };
}

function buildHomeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.homeNodeId) m.set(tpl.id, tpl.homeNodeId);
    }
  } catch {
    // configs 目录不可读时静默
  }
  return m;
}

// ---- relation auto-management ----

function manageRelations(
  characters: Character[],
  tick: number,
  events: WorldEvent[],
): void {
  // 同节点角色两两间是否本 tick 有互动事件
  const byNode = new Map<string, Character[]>();
  for (const c of characters) {
    const arr = byNode.get(c.locationId) ?? [];
    arr.push(c);
    byNode.set(c.locationId, arr);
  }

  for (const [, nodeChars] of byNode) {
    if (nodeChars.length < 2) continue;
    for (let i = 0; i < nodeChars.length; i++) {
      for (let j = i + 1; j < nodeChars.length; j++) {
        const a = nodeChars[i];
        const b = nodeChars[j];
        const interacted = events.some(
          (e) =>
            e.tick === tick &&
            e.participants.includes(a.id) &&
            e.participants.includes(b.id) &&
            (e.category === "social" || e.category === "action"),
        );
        if (interacted) {
          ensureAcquaintance(a, b.id, tick);
          ensureAcquaintance(b, a.id, tick);
        }
      }
    }
  }

  // acquaintance 衰减：lastInteractionTick 距今 ≥ 336 tick → 移除 acquaintance
  for (const c of characters) {
    for (const otherId of Object.keys(c.relations)) {
      const rel = c.relations[otherId];
      if (
        rel.kinds.includes("acquaintance") &&
        tick - rel.lastInteractionTick >= ACQUAINTANCE_DECAY_TICKS
      ) {
        rel.kinds = rel.kinds.filter((k) => k !== "acquaintance");
        if (rel.kinds.length === 0) {
          delete c.relations[otherId];
        }
      }
    }
  }
}

function ensureAcquaintance(
  a: Character,
  bId: string,
  tick: number,
): void {
  const rel = a.relations[bId];
  if (!rel || rel.kinds.length === 0) {
    const fresh: Relation = {
      kinds: ["acquaintance"],
      affection: 0,
      since: tick,
      lastInteractionTick: tick,
    };
    a.relations[bId] = fresh;
  } else {
    rel.lastInteractionTick = tick;
    if (!rel.kinds.includes("acquaintance")) {
      // 已有 friend / partner 等更强关系时不重复加 acquaintance
      // （仅在没有任何"熟人级别"关系时才加；这里简化为：始终不重复加）
    }
  }
}

export type { LoadedWorld };
