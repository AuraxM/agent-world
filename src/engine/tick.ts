/**
 * 模拟引擎主循环（v2 — 角色系统重设计后）。
 *
 * 顺序：
 *   1. 加载世界 (loadWorld)
 *   2. vitals 衰减 + emotion 演化 → 衍生 inner 事件
 *   3. 玩家排队的 pending 事件（Stage 1 暂为空）
 *   4. dispatchPerception → 谁看见了什么
 *   5. 对每个角色并发：
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
import { TICKS_PER_HOUR } from "@/domain/enums";
import { buildActionContext, getAvailableActions } from "./actions";
import { executeActions } from "./execute";
import { deriveAggregatedFacts, type AggregatedFacts } from "./facts";
import { findPath } from "./pathfinding";
import { dispatchPerception } from "./perception";
import { decayVitals, evolveEmotions } from "./vitals-emotion";
import { DEFAULT_SLEEP_WINDOW, inSleepWindow, timeOfDay } from "@/llm/prompt";
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
  SleepWindow,
  WorldEvent,
} from "@/domain/types";
import type { ActionOption } from "./actions";
import { runDialogPhase, type RunDialogPhaseInput } from "./dialog";
import {
  llmAcceptDecide,
  llmDialogTurn,
  llmDialogSummarize,
  llmSalvageDecide,
} from "@/llm/decide";

const FACTS_LOOKBACK_TICKS = 48 * TICKS_PER_HOUR;
/** 14 游戏日 = 14 * 24 = 336 小时 */
const ACQUAINTANCE_DECAY_TICKS = 336 * TICKS_PER_HOUR;

export interface DecideInput {
  character: Character;
  /** 全图节点（世界静态，不随 tick 变）；用于 system prompt 的拓扑渲染，让 LLM 能规划多步路径。 */
  nodes: MapNode[];
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
  /** 每个角色 LLM 决策完成时回调（用于 SSE 流式推送）。 */
  onCharacterDecision?: (data: {
    characterId: string;
    characterName: string;
    action: Action;
  }) => void;
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

function handleOngoingMove(
  c: Character,
  fromTick: number,
  worldId: string,
  nodeById: Map<string, MapNode>,
): { action: Action; arrived: boolean } {
  const ca = c.currentAction!;
  const path = ca.path!;
  const currentStep = ca.stepIndex ?? 0;

  const nextStep = currentStep + 1;
  ca.stepIndex = nextStep;
  c.locationId = path[nextStep];

  if (nextStep >= path.length - 1) {
    const destId = path[path.length - 1];
    const destName = nodeById.get(destId)?.name ?? destId;
    c.currentAction = undefined;
    return {
      action: {
        type: ca.arrivalAction?.type ?? "wait",
        actorId: c.id,
        targetId: ca.arrivalAction?.targetId,
        targetNodeId: ca.arrivalAction?.targetNodeId,
        freeText: ca.arrivalAction?.freeText,
        reasoning: `到达目的地 ${destName}，执行 ${ca.arrivalAction?.type ?? "wait"}。`,
        selfImportance: 3,
        isArrivalAction: true,
        arrivalNodeName: destName,
      },
      arrived: true,
    };
  }

  return {
    action: {
      type: "wait",
      actorId: c.id,
      reasoning: `正在前往目的地途中（第 ${nextStep}/${path.length - 1} 步）。`,
      selfImportance: 1,
    },
    arrived: false,
  };
}

function pushMoveInitMemory(
  c: Character,
  tick: number,
  action: Action,
  targetNodeName: string,
): void {
  const content = `${c.name} 前往 ${targetNodeName} ${action.reason ?? ""}`.trim();
  c.shortMemory.push({
    id: `mem-${randomUUID().slice(0, 8)}`,
    tick,
    importance: action.selfImportance,
    content,
  });
  if (c.shortMemory.length > 50) {
    c.shortMemory.splice(0, c.shortMemory.length - 50);
  }
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
  const activityMap = buildActivityNodeMap();
  const restMap = buildRestNodeMap();
  const sleepWindowMap = buildSleepWindowMap();
  const sinceTick = Math.max(0, fromTick - FACTS_LOOKBACK_TICKS);
  const baseTime = timeOfDay(fromTick); // hour/day/period 全局；isSleepHour 在循环内逐角色算
  const decideFn = options.forceWait
    ? async (input: DecideInput) => fallbackWait(input.character)
    : (options.decide ?? DEFAULT_DECIDE);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // 6. 角色决策（并发：各角色基于 tick 开始时快照独立决策，LLM 调用并行）
  const actionsForExecution: Action[] = [];

  // 位置快照：并发任务间互不干扰
  const locationSnapshot = new Map(characters.map((c) => [c.id, c.locationId]));

  type DecisionTaskResult = {
    characterId: string;
    action: Action;
    freeMoveEvents: WorldEvent[];
    finalLocationId: string;
  };

  const decisionTasks: Promise<DecisionTaskResult>[] = characters.map(
    async (c) => {
      const freeMoveEvents: WorldEvent[] = [];

      // 6a. 持续行动检查
      if (c.currentAction && fromTick < c.currentAction.endsAt) {
        const perceived = perceptions.get(c.id) ?? [];
        const interrupt = perceived.find(
          (e) => e.intensity >= c.currentAction!.interruptThreshold,
        );

        if (interrupt) {
          // Handle interrupt for sleep/nap: partial recovery
          if (c.currentAction.type === "sleep" || c.currentAction.type === "nap") {
            const ticksDone = fromTick - c.currentAction.startedAt;
            const hoursDone = Math.floor(ticksDone / TICKS_PER_HOUR);
            if (c.currentAction.type === "sleep") {
              c.vitals.fatigue = Math.max(0, c.vitals.fatigue - hoursDone);
            } else if (c.currentAction.type === "nap") {
              const reduction = Math.floor((hoursDone * 6) / 4);
              c.vitals.fatigue = Math.max(0, c.vitals.fatigue - reduction);
            }
            if (c.vitals.fatigue < 16) c.vitals.fatigueCapTicks = 0;
          }
          // For move: initiation memory already written, no arrival memory needed

          freeMoveEvents.push(
            makeInnerEvent({
              worldId,
              tick: fromTick,
              charId: c.id,
              description: `被「${interrupt.description}」打断。`,
              intensity: 2,
            }),
          );
          c.currentAction = undefined;
          // Fall through to normal LLM decision below
        } else if (c.currentAction.type === "move") {
          // Auto-step along path
          const result = handleOngoingMove(c, fromTick, worldId, nodeById);
          if (result.arrived) {
            options.onCharacterDecision?.({
              characterId: c.id,
              characterName: c.name,
              action: result.action,
            });
            return {
              characterId: c.id,
              action: result.action,
              freeMoveEvents,
              finalLocationId: c.locationId,
            };
          }
          // Still moving
          options.onCharacterDecision?.({
            characterId: c.id,
            characterName: c.name,
            action: result.action,
          });
          return {
            characterId: c.id,
            action: result.action,
            freeMoveEvents,
            finalLocationId: c.locationId,
          };
        } else {
          // sleep/nap: existing auto-wait logic
          if (fromTick % (4 * TICKS_PER_HOUR) === 0) {
            freeMoveEvents.push(
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
          options.onCharacterDecision?.({
            characterId: c.id,
            characterName: c.name,
            action: waitAction,
          });
          return {
            characterId: c.id,
            action: waitAction,
            freeMoveEvents,
            finalLocationId: locationSnapshot.get(c.id)!,
          };
        }
      }

      // 6b. ongoing action 到期：结算效果。
      // 用 >= 而非 ===：异常恢复 / 快进越界时也能正确结算，避免 sleep 完成
      // 但 fatigue 没归零的死循环。
      if (c.currentAction && fromTick >= c.currentAction.endsAt) {
        if (c.currentAction.type === "sleep") {
          c.vitals.fatigue = 0;
          c.vitals.fatigueCapTicks = 0;
        } else if (c.currentAction.type === "nap") {
          c.vitals.fatigue = Math.max(0, c.vitals.fatigue - 6);
          if (c.vitals.fatigue < 16) c.vitals.fatigueCapTicks = 0;
        }
        c.currentAction = undefined;
      }

      // 6c. Single LLM decision (no free-move loop)
      let currentLoc = locationSnapshot.get(c.id)!;
      const localLocationMap = new Map(locationSnapshot);
      let action: Action;

      localLocationMap.set(c.id, currentLoc);
      const ctx = buildActionContext(c, nodes, characters, localLocationMap);
      const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
      const activityNodeId = activityMap.get(c.id) ?? null;
      const restNodeId = restMap.get(c.id) ?? null;
      c.activityNodeId = activityNodeId;
      c.restNodeId = restNodeId;
      const sleepWindow = sleepWindowMap.get(c.id) ?? DEFAULT_SLEEP_WINDOW;
      c.sleepWindow = sleepWindow;
      const isSleepHour = inSleepWindow(baseTime.hour, sleepWindow);
      const facts = deriveAggregatedFacts({
        character: c,
        nodes,
        currentTick: fromTick,
        recentThoughts,
        activityNodeId,
        restNodeId,
      });
      const opts = getAvailableActions(ctx, {
        facts,
        isSleepHour,
      });

      try {
        action = await decideFn({
          character: c,
          nodes,
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

      // If move with destination → compute path
      if (action.type === "move" && action.targetNodeId && action.targetNodeId !== currentLoc) {
        const path = findPath(currentLoc, action.targetNodeId, nodes);
        if (!path) {
          // Unreachable node → fallback to wait
          action = {
            type: "wait",
            actorId: c.id,
            reasoning: `想去 ${action.targetNodeId} 但不可达，原地等待。原因为：${action.reason ?? "无"}`,
            selfImportance: action.selfImportance,
          };
        } else {
          const targetNode = nodeById.get(action.targetNodeId);
          // Write move initiation memory
          pushMoveInitMemory(c, fromTick, action, targetNode?.name ?? action.targetNodeId);

          // Setup ongoing action for path traversal
          c.currentAction = {
            type: "move",
            startedAt: fromTick,
            endsAt: fromTick + path.length - 1,
            description: `前往 ${targetNode?.name ?? action.targetNodeId} 途中`,
            interruptThreshold: 4,
            path,
            stepIndex: 0,
            arrivalAction: action.arrivalAction,
            reason: action.reason,
          };

          // Take first step
          c.locationId = path[1];
          c.currentAction.stepIndex = 1;

          if (path.length <= 2) {
            // Single step → arrived immediately, execute arrivalAction
            c.currentAction = undefined;
            action = {
              type: action.arrivalAction?.type ?? "wait",
              actorId: c.id,
              targetId: action.arrivalAction?.targetId,
              targetNodeId: action.arrivalAction?.targetNodeId,
              freeText: action.arrivalAction?.freeText,
              reasoning: `已到达 ${targetNode?.name ?? action.targetNodeId}，执行到达动作。`,
              selfImportance: action.selfImportance,
              isArrivalAction: true,
              arrivalNodeName: targetNode?.name ?? action.targetNodeId,
            };
          } else {
            // Multi-step: this tick resolves as wait
            action = {
              type: "wait",
              actorId: c.id,
              reasoning: `开始前往 ${targetNode?.name ?? action.targetNodeId}，共需 ${path.length - 1} 步。原因为：${action.reason ?? "无"}`,
              selfImportance: action.selfImportance,
            };
          }
          currentLoc = c.locationId;
        }
      }

      // 回调通知（在每个角色 LLM 调用完成后立即推送，不等其他角色）
      options.onCharacterDecision?.({
        characterId: c.id,
        characterName: c.name,
        action,
      });

      return {
        characterId: c.id,
        action,
        freeMoveEvents,
        finalLocationId: currentLoc,
      };
    },
  );

  // 收集结果（每个完成时回调，用于 SSE 流式推送）
  const settled = await Promise.allSettled(decisionTasks);
  for (const result of settled) {
    if (result.status === "fulfilled") {
      const { characterId, action, freeMoveEvents, finalLocationId } =
        result.value;
      const c = characters.find((ch) => ch.id === characterId);
      if (c) c.locationId = finalLocationId;
      allEvents.push(...freeMoveEvents);
      actionsForExecution.push(action);
      allDecisions.push({ characterId, action, success: true });
    } else {
      const errMsg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      const idx = settled.indexOf(result);
      const c = characters[idx];
      if (c) {
        const waitAction = fallbackWait(c);
        waitAction.reasoning = `决策任务异常：${errMsg}`;
        actionsForExecution.push(waitAction);
        allDecisions.push({
          characterId: c.id,
          action: waitAction,
          success: false,
        });
      }
    }
  }

  // ── Phase 4.5: Dialog protocol ──
  const dialogResult = await runDialogPhase({
    rawActions: actionsForExecution,
    characters,
    nodes,
    perceptions,
    tick: fromTick,
    worldName: world.name,
    acceptDecide: (input) => llmAcceptDecide(input),
    turnDecide: (input) => llmDialogTurn(input),
    summaryDecide: (input) => llmDialogSummarize(input),
    salvageDecide: async (input) => {
      const ctx = buildActionContext(
        input.character,
        nodes,
        characters,
      );
      const recentThoughts = loadRecentThoughts(worldId, input.character.id, sinceTick);
      const sActivityId = activityMap.get(input.character.id) ?? null;
      const sRestId = restMap.get(input.character.id) ?? null;
      const sleepWindow = sleepWindowMap.get(input.character.id) ?? DEFAULT_SLEEP_WINDOW;
      const isSleepHour = inSleepWindow(baseTime.hour, sleepWindow);
      const facts = deriveAggregatedFacts({
        character: input.character,
        nodes,
        currentTick: fromTick,
        recentThoughts,
        activityNodeId: sActivityId,
        restNodeId: sRestId,
      });
      const opts = getAvailableActions(ctx, { facts, isSleepHour });

      try {
        return await llmSalvageDecide({
          character: {
            ...input.character,
            sleepWindow,
            activityNodeId: sActivityId,
            restNodeId: sRestId,
          },
          nodes,
          here: ctx.here,
          companions: ctx.companions,
          reachable: ctx.reachable,
          perceived: perceptions.get(input.character.id) ?? [],
          options: opts,
          worldName: world.name,
          tick: fromTick,
          facts,
          rejectReason: input.rejectReason,
        });
      } catch {
        return {
          type: "wait" as const,
          actorId: input.character.id,
          reasoning: `补救决策违规，回退等待：${input.rejectReason}`,
          selfImportance: 1,
        };
      }
    },
  });

  // Apply dialog results
  for (const mw of dialogResult.memoryWrites) {
    const c = characters.find((ch) => ch.id === mw.characterId);
    if (c) {
      c.shortMemory.push(mw.memory);
      if (c.shortMemory.length > 50) {
        c.shortMemory.splice(0, c.shortMemory.length - 50);
      }
    }
  }
  allEvents.push(...dialogResult.dialogEvents);
  // Replace actionsForExecution with dialog-adjusted actions
  actionsForExecution.length = 0;
  actionsForExecution.push(...dialogResult.finalActions);

  // Re-sync allDecisions to match finalActions (for onCharacterDecision callbacks)
  for (const fa of dialogResult.finalActions) {
    const existing = allDecisions.find((d) => d.characterId === fa.actorId);
    if (existing) {
      existing.action = fa;
    }
  }

  // ── End Phase 4.5 ──

  // 7. 执行（move 已在 free-move 循环里处理；execute 内部的 move 分支保留兼容）
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

  if (world.currentTick > 0 && world.currentTick % (24 * TICKS_PER_HOUR) === 0) {
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

function buildActivityNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.activityNodeId) m.set(tpl.id, tpl.activityNodeId);
    }
  } catch {
    // configs 目录不可读时静默
  }
  return m;
}

function buildRestNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.restNodeId) m.set(tpl.id, tpl.restNodeId);
    }
  } catch {
    // configs 目录不可读时静默
  }
  return m;
}

function buildSleepWindowMap(): Map<string, SleepWindow> {
  const m = new Map<string, SleepWindow>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.sleepWindow) m.set(tpl.id, tpl.sleepWindow);
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
  }
}

export type { LoadedWorld };
