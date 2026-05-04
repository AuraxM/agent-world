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
import { createLogger } from "@/util/logger";

const log = createLogger("tick");

import { randomUUID } from "node:crypto";
import { TICKS_PER_HOUR } from "@/domain/enums";
import { buildActionContext } from "./actions";
import { compressSleepMemories } from "./memory-compression";
import { actionRegistry } from "@/domain/action-system";
import { BUILTIN_ACTIONS } from "./actions-builtin";
import { executeActions } from "./execute";
import { deriveAggregatedFacts, type AggregatedFacts } from "./facts";
import { findPath } from "./pathfinding";
import { dispatchPerception } from "./perception";
import { decayVitals, evolveEmotions, checkSickness } from "./vitals-emotion";
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
import { loadAllCharacters, loadManifest, loadEconomyConfig } from "@/config/loader";
import type { Language } from "@/config/types";
import { updateAllEconomicSnapshots } from "./economy";
import type {
  Action,
  Character,
  MapNode,
  Relation,
  SleepWindow,
  WorldEvent,
} from "@/domain/types";
import type { ActionOption } from "./actions";
import {
  runDialogPhase,
  type RunDialogPhaseInput,
  loadConversations,
  saveConversation,
  deleteConversation,
} from "./dialog";
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
  language: Language;
  /** ActionContext，供 decide.ts 生成 per-action tools。 */
  ctx: import("@/domain/action-system").ActionContext;
  /** 全量角色列表，用于用户 prompt 身份锚点的 workplace 关系解析。 */
  allCharacters: Character[];
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
    skipExecution: true,
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

/** Strip "action_" prefix if present (LLM sometimes returns tool names as action types). */
function normalizeActionType(t: string): string {
  if (t.startsWith("action_")) return t.slice("action_".length);
  return t;
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
    const arrivalType = normalizeActionType(ca.arrivalAction?.type ?? "wait");
    return {
      action: {
        type: arrivalType,
        actorId: c.id,
        targetId: ca.arrivalAction?.targetId,
        targetNodeId: ca.arrivalAction?.targetNodeId,
        freeText: ca.arrivalAction?.freeText,
        reasoning: `到达目的地 ${destName}，执行 ${arrivalType}。`,
        selfImportance: 3,
        isArrivalAction: true,
        arrivalNodeName: destName,
        // "wait" fallback (no arrivalAction) is a proxy — skip registry execution
        ...(arrivalType === "wait" && !ca.arrivalAction ? { skipExecution: true } as any : {}),
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
      skipMemory: true,
      skipExecution: true,
    },
    arrived: false,
  };
}

let _actionsInitialized = false;

function ensureActionsInitialized(): void {
  if (_actionsInitialized) return;
  _actionsInitialized = true;
  actionRegistry.registerAll(BUILTIN_ACTIONS);
}

export async function tick(
  worldId: string,
  options: TickOptions = {},
): Promise<TickResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters } = loaded;
  const fromTick = world.currentTick;
  const manifest = loadManifest(world.mapId);
  const language = manifest.language;

  // Register built-in actions (idempotent)
  ensureActionsInitialized();

  // Load mod actions if defined
  if (manifest.actions) {
    try {
      const { loadModActions } = await import("@/config/mod-loader");
      const modDefs = loadModActions(world.mapId);
      actionRegistry.registerAll(modDefs);
    } catch (err) {
      log.warn("Failed to load mod actions", { mapId: world.mapId, error: String(err) });
    }
  }

  const allEvents: WorldEvent[] = [];
  const allDecisions: Array<{
    characterId: string;
    action: Action;
    success: boolean;
  }> = [];

  const t0 = Date.now();
  log.info(`tick #${fromTick} 开始`, {
    角色数: characters.length,
    节点数: nodes.length,
  });

  // 1. vitals decay
  allEvents.push(...decayVitals({ characters, worldId, tick: fromTick }));

  // Daily sickness check (once per game day)
  if (fromTick % 120 === 0) {
    allEvents.push(...checkSickness({ characters, worldId, tick: fromTick }));
  }

  const tAfterVitals = Date.now();

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

  // Low-money detection: generate inner events for characters in financial distress
  const economyConfig = loadEconomyConfig(world.mapId);
  const maxSurvivalCost = Math.max(
    economyConfig.survivalCosts.eat,
    economyConfig.survivalCosts.bathe,
  );
  for (const c of characters) {
    if (!c.expenseExempt && c.money < maxSurvivalCost && c.incomeLevel <= 0) {
      allEvents.push(makeInnerEvent({
        worldId,
        tick: fromTick,
        charId: c.id,
        description: "经济困难，余额不足以支付基本生存开销，需要帮助。",
        intensity: 3,
      }));
      log.warn("经济困难", { 角色: c.name, money: c.money, 生存成本: maxSurvivalCost });
    }
  }

  for (const c of characters) {
    if (c.emotion.mood <= -3 || c.emotion.mood >= 3) {
      log.warn("情绪极端", { 角色: c.name, mood: c.emotion.mood, stress: c.emotion.stress });
    }
    if (c.vitals.hunger >= 12) {
      log.warn("生理极值", { 角色: c.name, vital: "hunger", value: c.vitals.hunger });
    } else if (c.vitals.fatigue >= 12) {
      log.warn("生理极值", { 角色: c.name, vital: "fatigue", value: c.vitals.fatigue });
    } else if (c.vitals.hygiene >= 12) {
      log.warn("生理极值", { 角色: c.name, vital: "hygiene", value: c.vitals.hygiene });
    }
  }
  const tAfterEmotion = Date.now();

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

  // Load ongoing conversations
  const ongoingConversations = loadConversations(worldId);

  // Mark initiators as locked — skip normal action selection
  const lockedCharacterIds = new Set<string>();
  for (const conv of ongoingConversations) {
    if (conv.status !== "ended") {
      lockedCharacterIds.add(conv.initiatorId);
      const initiator = characters.find((c) => c.id === conv.initiatorId);
      if (initiator && !initiator.activeConversationIds.includes(conv.id)) {
        initiator.activeConversationIds.push(conv.id);
      }
      const acceptor = characters.find((c) => c.id === conv.acceptorId);
      if (acceptor && !acceptor.activeConversationIds.includes(conv.id)) {
        acceptor.activeConversationIds.push(conv.id);
      }
    }
  }

  // 6. 角色决策（并发：各角色基于 tick 开始时快照独立决策，LLM 调用并行）
  const actionsForExecution: Action[] = [];

  // Filter out characters locked in ongoing conversations
  const freeCharacters = characters.filter((c) => !lockedCharacterIds.has(c.id));

  // Add placeholder wait actions for locked initiators
  for (const charId of lockedCharacterIds) {
    const conv = ongoingConversations.find((c) => c.initiatorId === charId && c.status !== "ended");
    const acceptorName = conv
      ? characters.find((c) => c.id === conv.acceptorId)?.name ?? "某人"
      : "某人";
    actionsForExecution.push({
      type: "wait",
      actorId: charId,
      reasoning: `正在和 ${acceptorName} 对话`,
      selfImportance: 2,
      skipExecution: true,
    });
  }

  // 位置快照：并发任务间互不干扰
  const locationSnapshot = new Map(characters.map((c) => [c.id, c.locationId]));

  type DecisionTaskResult = {
    characterId: string;
    action: Action;
    freeMoveEvents: WorldEvent[];
    finalLocationId: string;
  };

  const decisionTasks: Promise<DecisionTaskResult>[] = freeCharacters.map(
    async (c) => {
      const freeMoveEvents: WorldEvent[] = [];

      // 6a. 持续行动检查
      if (c.currentAction && fromTick < c.currentAction.endsAt) {
        const perceived = perceptions.get(c.id) ?? [];
        const interrupt = perceived.find(
          (e) => e.intensity >= c.currentAction!.interruptThreshold,
        );

        if (interrupt) {
          const actionDef = actionRegistry.get(c.currentAction!.type);
          if (actionDef?.onInterrupt) {
            const here = nodeById.get(locationSnapshot.get(c.id) ?? c.locationId);
            if (here) {
              const ctx = {
                worldId, tick: fromTick, self: c, here,
                companions: [], reachable: [], isSleepHour: false, facts: {} as any,
              };
              const outcome = actionDef.onInterrupt(ctx, `被「${interrupt.description}」打断`);
              c.shortMemory.push({
                id: `mem-${randomUUID().slice(0, 8)}`,
                tick: fromTick,
                importance: 4,
                content: outcome.memory,
              });
            }
          } else {
            // Generic interrupt memory if no onInterrupt hook
            const desc = c.currentAction.description;
            c.shortMemory.push({
              id: `mem-${randomUUID().slice(0, 8)}`,
              tick: fromTick,
              importance: 4,
              content: `${desc}被「${interrupt.description}」打断。`,
            });
          }

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
          // sleep: existing auto-wait logic
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
            skipMemory: true,
            skipExecution: true,
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
      if (c.currentAction && fromTick >= c.currentAction.endsAt) {
        const actionDef = actionRegistry.get(c.currentAction!.type);
        if (actionDef?.onComplete) {
          // Build minimal context
          const here = nodeById.get(locationSnapshot.get(c.id) ?? c.locationId);
          if (here) {
            const ctx = {
              worldId, tick: fromTick, self: c, here,
              companions: [], reachable: [], isSleepHour: false, facts: {} as any,
            };
            const outcome = actionDef.onComplete(ctx);
            c.shortMemory.push({
              id: `mem-${randomUUID().slice(0, 8)}`,
              tick: fromTick,
              importance: 3,
              content: outcome.memory,
            });
            if (outcome.stateChanges) {
              for (const sc of outcome.stateChanges) {
                // Apply state changes inline (simplified):
                if (sc.kind === "resetVital") {
                  c.vitals[sc.vital] = 0;
                  if (sc.vital === "fatigue") c.vitals.fatigueCapTicks = 0;
                } else if (sc.kind === "adjustVital" && sc.vital === "fatigue") {
                  c.vitals.fatigue = Math.max(0, c.vitals.fatigue + sc.delta);
                  if (c.vitals.fatigue < 16) c.vitals.fatigueCapTicks = 0;
                }
              }
            }
            if (outcome.event) {
              allEvents.push({
                id: `evt-${randomUUID().slice(0, 8)}`,
                worldId, tick: fromTick,
                category: outcome.event.category,
                description: outcome.event.description,
                participants: [c.id],
                source: "actor",
                intensity: outcome.event.intensity ?? 1,
                scope: outcome.event.scope ?? "node",
                nodeId: c.locationId,
                duration: 1,
              });
            }
          }
        }
        c.currentAction = undefined;
      }

      // 6c. Single LLM decision (no free-move loop)
      let currentLoc = locationSnapshot.get(c.id)!;
      const localLocationMap = new Map(locationSnapshot);
      let action: Action;

      localLocationMap.set(c.id, currentLoc);
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
      const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, isSleepHour, facts, localLocationMap);
      const opts = actionRegistry.buildOptions(ctx);

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
          language,
          ctx,
          allCharacters: loaded.characters,
        });
      } catch (err) {
        log.warn("角色决策失败", { 角色: c.name, error: err instanceof Error ? err.message : String(err) });
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
            skipExecution: true,
          };
        } else {
          const targetNode = nodeById.get(action.targetNodeId);
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
              type: normalizeActionType(action.arrivalAction?.type ?? "wait"),
              actorId: c.id,
              targetId: action.arrivalAction?.targetId,
              targetNodeId: action.arrivalAction?.targetNodeId,
              freeText: action.arrivalAction?.freeText,
              reasoning: `已到达 ${targetNode?.name ?? action.targetNodeId}，执行到达动作。`,
              selfImportance: action.selfImportance,
              isArrivalAction: true,
              arrivalNodeName: targetNode?.name ?? action.targetNodeId,
            };
            // "wait" fallback (no arrivalAction) is a proxy — skip registry execution
            if (action.type === "wait" && !action.arrivalAction) {
              (action as any).skipExecution = true;
            }
          } else {
            // Multi-step: this tick resolves as wait (proxy, move itself tracks progress)
            action = {
              type: "wait",
              actorId: c.id,
              reasoning: `开始前往 ${targetNode?.name ?? action.targetNodeId}，共需 ${path.length - 1} 步。原因为：${action.reason ?? "无"}`,
              selfImportance: action.selfImportance,
              skipExecution: true,
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
        log.error("决策任务异常", { 角色: c?.name ?? "未知", error: errMsg });
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
  const tAfterDecisions = Date.now();

  // ── Phase 4.5: Dialog protocol ──
  const dialogResult = await runDialogPhase({
    rawActions: actionsForExecution,
    characters,
    nodes,
    perceptions,
    tick: fromTick,
    worldName: world.name,
    language,
    acceptDecide: (input) => llmAcceptDecide(input),
    turnDecide: (input) => llmDialogTurn(input),
    summaryDecide: (input) => llmDialogSummarize(input),
    salvageDecide: async (input) => {
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
      const ctx = buildActionContext(input.character, nodes, characters, worldId, fromTick, isSleepHour, facts);
      const opts = actionRegistry.buildOptions(ctx);

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
          ctx,
          rejectReason: input.rejectReason,
          language,
          allCharacters: characters,
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
    ongoingConversations,
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
  const tAfterDialog = Date.now();

  // Re-sync allDecisions to match finalActions (for onCharacterDecision callbacks)
  for (const fa of dialogResult.finalActions) {
    const existing = allDecisions.find((d) => d.characterId === fa.actorId);
    if (existing) {
      existing.action = fa;
    }
  }

  // Persist conversation changes
  for (const conv of dialogResult.updatedConversations) {
    saveConversation(conv);
  }
  // Remove ended conversations
  const endedIds = ongoingConversations
    .filter((c) => !dialogResult.updatedConversations.find((u) => u.id === c.id))
    .map((c) => c.id);
  for (const id of endedIds) {
    deleteConversation(worldId, id);
  }

  // ── End Phase 4.5 ──

  // Phase 4.6: Memory compression for characters going to sleep
  const sleepActionsForCompression = actionsForExecution.filter(a => a.type === "sleep");
  if (sleepActionsForCompression.length > 0) {
    await Promise.all(
      sleepActionsForCompression.map(async (action) => {
        const c = characters.find(ch => ch.id === action.actorId);
        if (c) {
          await compressSleepMemories(c, fromTick, language);
        }
      }),
    );
  }

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
  const tAfterExecute = Date.now();

  // 8. 关系自动管理
  manageRelations(characters, fromTick, allEvents);

  // 9. 持久化
  appendEventsLog(worldId, allEvents);
  world.currentTick = fromTick + 1;

  // Clean up stale activeConversationIds
  const activeConvIds = new Set(dialogResult.updatedConversations.map((c) => c.id));
  for (const c of characters) {
    c.activeConversationIds = c.activeConversationIds.filter((id) => activeConvIds.has(id));
  }

  saveWorld(loaded);
  const tAfterSave = Date.now();
  appendThoughts(
    worldId,
    execResult.resolvedActions.map((r) => ({
      characterId: r.action.actorId,
      tick: fromTick,
      action: r.action,
      success: r.success,
    })),
  );

  // Economic snapshot: update every 24 game hours
  if (world.currentTick > 0 && world.currentTick % (24 * TICKS_PER_HOUR) === 0) {
    const economyCfg = loadEconomyConfig(world.mapId);
    updateAllEconomicSnapshots(worldId, world.currentTick, characters, economyCfg);
    persistSnapshot(loaded);
  }

  log.info(`tick #${fromTick} 阶段耗时`, {
    vitalsMs: tAfterVitals - t0,
    emotionMs: tAfterEmotion - tAfterVitals,
    decisionMs: tAfterDecisions - tAfterEmotion,
    dialogMs: tAfterDialog - tAfterDecisions,
    executeMs: tAfterExecute - tAfterDialog,
    saveMs: tAfterSave - tAfterExecute,
    totalMs: tAfterSave - t0,
  });

  const successCount = allDecisions.filter((d) => d.success).length;
  const failCount = allDecisions.filter((d) => !d.success).length;
  log.info(`tick #${fromTick} 完成`, {
    总耗时ms: tAfterSave - t0,
    成功决策: successCount,
    失败决策: failCount,
  });

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
