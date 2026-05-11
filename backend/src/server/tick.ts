/**
 * 模拟引擎主循环（v2 — 角色系统重设计后）。
 *
 * 顺序：
 *   1. 加载世界
 *   2. vitals 衰减 + emotion 演化 → 衍生 inner 事件
 *   3. 玩家排队的 pending 事件
 *   4. dispatchPerception → 谁看见了什么
 *   5. 对每个角色并发决策（LLM）
 *   6. executeActions → 改状态 / 写记忆 / 衍生 action 事件
 *   7. 关系自动管理
 *   8. 持久化 events + world + thoughts
 *   9. 每 24 tick 写一次 snapshot
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "../shared/index";

const log = createLogger("tick");

import {
  TICKS_PER_HOUR,
  actionRegistry,
  getActiveEvents,
  type Action,
  type Character,
  type MapNode,
  type ThinkSession,
  type ThinkTurn,
  type WorldEvent,
} from "../domain/index";
import {
  buildActionContext,
  getAvailableActions,
  executeActions,
  applyStateChange,
  deriveAggregatedFacts,
  findPath,
  dispatchPerception,
  decayVitals,
  evolveEmotions,
  checkSickness,
  cleanExpiredEntries,
  getTodayEntries,
  describeEntries,
  loadWorld,
  saveWorld,
  appendEventsLog,
  appendThoughts,
  loadRecentThoughts,
  persistSnapshot,
  getSocialDecayPerTick,
  getSocialGainPerDialogTick,
  updateAllEconomicSnapshots,
  BUILTIN_ACTIONS,
  buildActivityNodeMap,
  buildRestNodeMap,
  buildSleepWindowMap,
  manageRelations,
  makeInnerEvent,
  type LoadedWorld,
} from "../systems/index";
import {
  loadManifest,
  loadEconomyConfig,
  loadEvents,
  loadModActions,
  loadAllItems,
} from "../config/index";
import { updateShopEmployment } from "../db/index";
import {
  llmDecide,
  llmAcceptDecide,
  llmDialogTurn,
  llmDialogSummarize,
  llmDialogPersonalMemory,
  llmSalvageDecide,
  llmThink,
  runDialogPhase,
  loadConversations,
  saveConversation,
  deleteConversation,
  loadThinkSessions,
  saveThinkSession,
  deleteThinkSession,
  compressSleepMemories,
  injectThinkTimeMessage,
  DEFAULT_SLEEP_WINDOW,
  inSleepWindow,
  timeOfDay,
  type DecideFn,
  type DecideInput,
} from "../llm/index";

const FACTS_LOOKBACK_TICKS = 48 * TICKS_PER_HOUR;
const THINK_TURNS_PER_TICK = 3;

function emptyFacts(): import("../domain/index").AggregatedFacts {
  return {
    activityNodeId: null,
    activityNodeName: null,
    restNodeId: null,
    restNodeName: null,
    hoursAtCurrentLocation: 0,
    todayActionCounts: {},
    todayChatTargets: {},
  };
}

export type { DecideFn, DecideInput, LoadedWorld };

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
  return llmDecide(input);
};

function fallbackLookAround(c: Character): Action {
  return {
    type: "look_around",
    actorId: c.id,
    reasoning: "（fallback）LLM 决策失败，环顾四周获取当前状态。",
    selfImportance: 1,
  };
}

/** Strip "action_" prefix if present. */
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
        ...(arrivalType === "wait" && !ca.arrivalAction ? { skipExecution: true } : {}),
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

/** 防止同一 (worldId, tick) 被并发执行。 */
const _activeTicks = new Set<string>();

export async function tick(
  worldId: string,
  options: TickOptions = {},
): Promise<TickResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters, shops } = loaded;
  const fromTick = world.currentTick;

  const itemDefsArr = loadAllItems(world.mapId);
  const itemDefs = new Map(itemDefsArr.map((d) => [d.id, d]));

  const lockKey = `${worldId}:${fromTick}`;
  if (_activeTicks.has(lockKey)) {
    throw new Error(
      `tick #${fromTick} 正在执行中，请等待当前 tick 完成后再推进。`,
    );
  }
  _activeTicks.add(lockKey);
  try {
  const manifest = loadManifest(world.mapId);
  const language = manifest.language;

  // Load events (builtin + mod) and compute active ones for this tick
  const allEventDefs = loadEvents(world.mapId);
  const activeEventDefs = getActiveEvents(allEventDefs, world.epoch, fromTick);

  // Register built-in actions (idempotent)
  ensureActionsInitialized();

  // Load mod actions if defined
  if (manifest.actions) {
    try {
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
  allEvents.push(
    ...evolveEmotions({ characters, worldId, tick: fromTick }),
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
  // Clean expired notebook entries
  cleanExpiredEntries(world.id, fromTick);
  // Also clean in-memory notebooks
  for (const c of characters) {
    c.notebook = c.notebook.filter(e => e.scheduledTick >= fromTick);
  }
  const baseTime = timeOfDay(fromTick, world.epoch);
  const decideFn = options.forceWait
    ? async (input: DecideInput) => fallbackLookAround(input.character)
    : (options.decide ?? DEFAULT_DECIDE);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Load ongoing conversations
  const ongoingConversations = loadConversations(worldId);

  // Mark initiators as locked — skip normal action selection
  const lockedCharacterIds = new Set<string>();
  for (const conv of ongoingConversations) {
    if (conv.status !== "ended") {
      lockedCharacterIds.add(conv.initiatorId);
      lockedCharacterIds.add(conv.acceptorId);
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

  // Load ongoing think sessions
  const ongoingThinkSessions = loadThinkSessions(worldId);

  // Lock characters in active think sessions
  for (const ts of ongoingThinkSessions) {
    if (ts.status !== "ended") {
      lockedCharacterIds.add(ts.characterId);
      const thinker = characters.find((c) => c.id === ts.characterId);
      if (thinker && !thinker.activeConversationIds.includes(ts.id)) {
        thinker.activeConversationIds.push(ts.id);
      }
    }
  }

  // ── travel_together: auto-step synchronised movement for paired characters ──
  const travelProcessed = new Set<string>();
  const travelArrivedThisTick = new Set<string>();
  for (const c of characters) {
    const ca = c.currentAction;
    if (!ca || ca.type !== "travel_together" || travelProcessed.has(c.id)) continue;

    const partnerId = ca.partnerId;
    if (!partnerId) continue;
    const partner = characters.find(p => p.id === partnerId);
    if (!partner) continue;

    travelProcessed.add(c.id);
    travelProcessed.add(partnerId);

    const path = ca.path;
    if (!path || path.length === 0) continue;

    const stepIndex = ca.stepIndex ?? 0;
    const nextStep = stepIndex + 1;

    // Step both characters forward together
    ca.stepIndex = nextStep;
    c.locationId = path[nextStep];
    if (partner.currentAction?.type === "travel_together") {
      partner.currentAction.stepIndex = nextStep;
      partner.locationId = path[nextStep];
    }

    // Lock both (ensures lock even after dialogue ends)
    lockedCharacterIds.add(c.id);
    lockedCharacterIds.add(partnerId);

    if (nextStep >= path.length - 1) {
      // ── Arrived at destination ──
      const destId = path[path.length - 1];
      const destName = nodeById.get(destId)?.name ?? destId;

      c.currentAction = undefined;
      if (partner.currentAction?.type === "travel_together") {
        partner.currentAction = undefined;
      }
      travelArrivedThisTick.add(c.id);
      travelArrivedThisTick.add(partnerId);

      c.shortMemory.push({
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick: fromTick,
        importance: 3,
        content: `我和 ${partner.name} 一起到达了 ${destName}。`,
        layer: "short",
      });
      partner.shortMemory.push({
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick: fromTick,
        importance: 3,
        content: `我和 ${c.name} 一起到达了 ${destName}。`,
        layer: "short",
      });

      allEvents.push({
        id: `evt-${randomUUID().slice(0, 8)}`,
        worldId,
        tick: fromTick,
        category: "action",
        description: `${c.name} 和 ${partner.name} 结伴到达了 ${destName}。`,
        participants: [c.id, partnerId],
        source: "actor",
        intensity: 2,
        scope: "node",
        nodeId: destId,
        duration: 1,
      });
    }
  }

  // 6. 角色决策（并发）
  const actionsForExecution: Action[] = [];

  // Filter out characters locked in ongoing conversations or think sessions
  const freeCharacters = characters.filter((c) => !lockedCharacterIds.has(c.id));

  // Add placeholder actions for locked characters
  for (const charId of lockedCharacterIds) {
    const conv = ongoingConversations.find((c) => (c.initiatorId === charId || c.acceptorId === charId) && c.status !== "ended");
    const ts = ongoingThinkSessions.find((s) => s.characterId === charId && s.status !== "ended");
    if (conv) {
      const otherName = conv.initiatorId === charId
        ? characters.find((c) => c.id === conv.acceptorId)?.name ?? "某人"
        : characters.find((c) => c.id === conv.initiatorId)?.name ?? "某人";
      actionsForExecution.push({
        type: "wait",
        actorId: charId,
        reasoning: `正在和 ${otherName} 对话`,
        selfImportance: 2,
        skipExecution: true, skipMemory: true,
      });
    } else if (ts) {
      actionsForExecution.push({
        type: "wait",
        actorId: charId,
        reasoning: "正在沉思",
        selfImportance: 2,
        skipExecution: true, skipMemory: true,
      });
    } else {
      // travel_together without active dialogue (dialogue ended, movement continues, or just arrived)
      const c = characters.find(ch => ch.id === charId);
      if (c?.currentAction?.type === "travel_together") {
        const path = c.currentAction.path!;
        const destId = path[path.length - 1];
        const destName = nodeById.get(destId)?.name ?? destId;
        const partnerId = c.currentAction.partnerId!;
        const partner = characters.find(p => p.id === partnerId);
        const step = c.currentAction.stepIndex ?? 0;
        actionsForExecution.push({
          type: "wait",
          actorId: charId,
          reasoning: `正与 ${partner?.name ?? "同伴"} 结伴前往 ${destName} 途中（第 ${step}/${path.length - 1} 步）。`,
          selfImportance: 2,
          skipExecution: true, skipMemory: true,
        });
      } else if (travelArrivedThisTick.has(charId) && c) {
        const partnerId = [...travelArrivedThisTick].find(id => id !== charId);
        const partnerName = partnerId ? characters.find(ch => ch.id === partnerId)?.name : "同伴";
        actionsForExecution.push({
          type: "wait",
          actorId: charId,
          reasoning: `刚和 ${partnerName} 结伴到达目的地。`,
          selfImportance: 2,
          skipExecution: true, skipMemory: true,
        });
      }
    }
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
                worldId, tick: fromTick, epoch: world.epoch, self: c, here,
                companions: [], reachable: [], isSleepHour: false, facts: emptyFacts(),
                shops, itemDefs,
              };
              const outcome = actionDef.onInterrupt(ctx, `被「${interrupt.description}」打断`);
              c.shortMemory.push({
                id: `mem-${randomUUID().slice(0, 8)}`,
                tick: fromTick,
                importance: 4,
                content: outcome.memory,
                layer: "short",
              });
            }
          } else {
            const desc = c.currentAction.description;
            c.shortMemory.push({
              id: `mem-${randomUUID().slice(0, 8)}`,
              tick: fromTick,
              importance: 4,
              content: `${desc}被「${interrupt.description}」打断。`,
              layer: "short",
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
          const here = nodeById.get(locationSnapshot.get(c.id) ?? c.locationId);
          if (here) {
            const ctx = {
              worldId, tick: fromTick, epoch: world.epoch, self: c, here,
              companions: [], reachable: [], isSleepHour: false, facts: emptyFacts(),
              shops, itemDefs,
            };
            const outcome = actionDef.onComplete(ctx);
            c.shortMemory.push({
              id: `mem-${randomUUID().slice(0, 8)}`,
              tick: fromTick,
              importance: 3,
              content: outcome.memory,
              layer: "short",
            });
            if (outcome.stateChanges) {
              for (const sc of outcome.stateChanges) {
                applyStateChange(c, sc, worldId, fromTick);
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

      // 6c. Single LLM decision
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
      const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, world.epoch, isSleepHour, facts, localLocationMap, shops, itemDefs);
      const opts = getAvailableActions(ctx);

      const todayEntries = getTodayEntries(c.notebook, fromTick);
      const upcomingNotebookText = describeEntries(todayEntries, fromTick, world.epoch);

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
          epoch: world.epoch,
          facts,
          language,
          ctx,
          allCharacters: loaded.characters,
          activeEventDefs,
          upcomingNotebookText,
        });
      } catch (err) {
        log.warn("角色决策失败", {
          角色: c.name,
          error: err instanceof Error ? err.message : String(err),
          ...(err && typeof err === "object" && "status" in err
            ? {
                apiStatus: (err as { status?: unknown }).status,
                apiErrorBody: JSON.stringify((err as { error?: unknown }).error).slice(0, 2000),
              }
            : {}),
        });
        action = fallbackLookAround(c);
        action.reasoning = `LLM 调用失败：${
          err instanceof Error ? err.message : String(err)
        }`;
      }

      // If move with destination → compute path
      if (action.type === "move" && action.targetNodeId && action.targetNodeId !== currentLoc) {
        const path = findPath(currentLoc, action.targetNodeId, nodes);
        if (!path) {
          action = {
            type: "wait",
            actorId: c.id,
            reasoning: `想去 ${action.targetNodeId} 但不可达，原地等待。原因为：${action.reason ?? "无"}`,
            selfImportance: action.selfImportance,
            skipExecution: true,
          };
        } else {
          const targetNode = nodeById.get(action.targetNodeId);
          c.currentAction = {
            type: "move",
            startedAt: fromTick,
            endsAt: fromTick + path.length - 1,
            description: `前往 ${targetNode?.name ?? action.targetNodeId} 途中`,
            interruptThreshold: 3,
            path,
            stepIndex: 0,
            arrivalAction: action.arrivalAction,
            reason: action.reason,
          };

          // Take first step
          c.locationId = path[1];
          c.currentAction.stepIndex = 1;

          if (path.length <= 2) {
            // Single step → arrived immediately
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
            if (action.type === "wait" && !action.arrivalAction) {
              action.skipExecution = true;
            }
          } else {
            // Multi-step: this tick resolves as wait
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

      // 回调通知
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

  // 收集结果
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
        log.error("决策任务异常", {
          角色: c?.name ?? "未知",
          error: errMsg,
          ...(result.reason && typeof result.reason === "object" && "status" in result.reason
            ? {
                apiStatus: (result.reason as { status?: unknown }).status,
                apiErrorBody: JSON.stringify((result.reason as { error?: unknown }).error).slice(0, 2000),
              }
            : {}),
        });
        const lookAction = fallbackLookAround(c);
        lookAction.reasoning = `决策任务异常：${errMsg}`;
        actionsForExecution.push(lookAction);
        allDecisions.push({
          characterId: c.id,
          action: lookAction,
          success: false,
        });
      }
    }
  }
  const tAfterDecisions = Date.now();

  // ── Phase 4.4 + 4.5: Think sessions and Dialog ──

  const thinkSessionsPromise = Promise.all(
    ongoingThinkSessions.map(async (ts) => {
      if (ts.status === "ended") return ts;

      const thinker = characters.find((c) => c.id === ts.characterId);
      if (!thinker) {
        ts.status = "ended";
        return ts;
      }

      const here = nodeById.get(thinker.locationId);
      if (!here) {
        ts.status = "ended";
        return ts;
      }

      const transcript: ThinkTurn[] = [...ts.transcript];

      // Inject time reminder before this tick's think rounds
      transcript.push({
        kind: "thought",
        text: injectThinkTimeMessage({
          tick: fromTick,
          epoch: world.epoch,
          tickStarted: ts.tickStarted,
          language,
        }),
      });

      for (let round = 0; round < THINK_TURNS_PER_TICK; round++) {
        let result;
        try {
          result = await llmThink({
            self: thinker,
            here,
            transcript,
            language,
            tick: fromTick,
            epoch: world.epoch,
            tickStarted: ts.tickStarted,
            previousMessages: ts.sharedMessages,
            previousTranscriptLength: ts.sharedMessagesTranscriptLength,
            allCharacters: characters,
            worldDescription: manifest.description,
            nodes,
          });
        } catch (err) {
          log.error("llmThink 异常，思考被迫终止", {
            character: thinker.name,
            error: err instanceof Error ? err.message : String(err),
          });
          ts.status = "ended";
          break;
        }

        if (result.messages) ts.sharedMessages = result.messages;
        if (result.transcriptLength !== undefined) ts.sharedMessagesTranscriptLength = result.transcriptLength;

        if (result.kind === "turn") {
          transcript.push(result.turn);
          thinker.emotion.social_satiety = Math.max(-4, thinker.emotion.social_satiety - 0.4);
        } else {
          thinker.shortMemory.push({
            id: `mem-${randomUUID().slice(0, 8)}`,
            tick: fromTick,
            importance: 3,
            content: `我沉思了一番：${result.summary}`,
            layer: "short",
          });
          ts.summary = result.summary;
          ts.status = "ended";
          break;
        }
      }

      ts.transcript = transcript;
      ts.currentTickRounds = THINK_TURNS_PER_TICK;

      return ts;
    }),
  );

  const dialogPromise = runDialogPhase({
    rawActions: actionsForExecution,
    characters,
    nodes,
    perceptions,
    tick: fromTick,
    epoch: world.epoch,
    worldName: world.name,
    worldDescription: manifest.description,
    language,
    acceptDecide: (input) => llmAcceptDecide(input),
    turnDecide: (input) => llmDialogTurn(input),
    summaryDecide: (input) => llmDialogSummarize(input),
    personalMemoryDecide: (input) => llmDialogPersonalMemory(input),
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
      const ctx = buildActionContext(input.character, nodes, characters, worldId, fromTick, world.epoch, isSleepHour, facts, undefined, shops, itemDefs);
      const opts = getAvailableActions(ctx);

      const todayEntries = getTodayEntries(input.character.notebook, fromTick);
      const upcomingNotebookText = describeEntries(todayEntries, fromTick, world.epoch);

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
          epoch: world.epoch,
          facts,
          ctx,
          rejectReason: input.rejectReason,
          language,
          allCharacters: characters,
          activeEventDefs,
          upcomingNotebookText,
        });
      } catch {
        return {
          type: "look_around" as const,
          actorId: input.character.id,
          reasoning: `补救决策违规，回退等待：${input.rejectReason}`,
          selfImportance: 1,
        };
      }
    },
    ongoingConversations,
  });

  const [updatedThinkSessions, dialogResult] = await Promise.all([
    thinkSessionsPromise,
    dialogPromise,
  ]);

  // Persist think session changes
  for (const ts of updatedThinkSessions) {
    if (ts.status === "ended") {
      deleteThinkSession(worldId, ts.id);
      const thinker = characters.find((c) => c.id === ts.characterId);
      if (thinker) {
        thinker.activeConversationIds = thinker.activeConversationIds.filter((id) => id !== ts.id);
        const summary = ts.summary ?? "沉思结束";
        allEvents.push({
          id: `evt-${randomUUID().slice(0, 8)}`,
          worldId,
          tick: fromTick,
          category: "inner",
          description: summary,
          participants: [ts.characterId],
          source: "think",
          intensity: 2,
          scope: "private",
          audienceCharacterId: ts.characterId,
          duration: 1,
          thinkTranscript: ts.transcript,
          thinkEndedBy: ts.summary ? "natural" : "interrupted",
        });
      }
    } else {
      saveThinkSession(ts);
    }
  }

  // Apply dialog results
  for (const mw of dialogResult.memoryWrites) {
    const c = characters.find((ch) => ch.id === mw.characterId);
    if (c) {
      c.shortMemory.push(mw.memory);
      if (c.shortMemory.length > 120) {
        c.shortMemory.splice(0, c.shortMemory.length - 120);
      }
    }
  }
  allEvents.push(...dialogResult.dialogEvents);
  // Replace actionsForExecution with dialog-adjusted actions
  actionsForExecution.length = 0;
  actionsForExecution.push(...dialogResult.finalActions);
  const tAfterDialog = Date.now();

  // Re-sync allDecisions to match finalActions
  for (const fa of dialogResult.finalActions) {
    const existing = allDecisions.find((d) => d.characterId === fa.actorId);
    if (existing) {
      existing.action = fa;
    }
  }

  // Persist or delete conversation changes
  for (const conv of dialogResult.updatedConversations) {
    if (conv.status === "ended") {
      deleteConversation(worldId, conv.id);
    } else {
      saveConversation(conv);
    }
  }

  // ── Phase 4.5.1: Create think sessions for think actions ──
  const newThinkSessions: ThinkSession[] = [];
  for (const action of actionsForExecution) {
    if (action.type === "think" && !action.skipExecution) {
      action.skipExecution = true;
      action.skipMemory = true;
      const thinker = characters.find((c) => c.id === action.actorId);
      if (thinker && !lockedCharacterIds.has(action.actorId)) {
        const ts: ThinkSession = {
          id: `think-${randomUUID().slice(0, 8)}`,
          worldId,
          characterId: action.actorId,
          transcript: action.freeText
            ? [{ kind: "thought", text: action.freeText }]
            : [{ kind: "thought", text: "开始沉思" }],
          tickStarted: fromTick,
          currentTickRounds: 0,
          status: "active",
          sharedMessages: [],
          sharedMessagesTranscriptLength: 0,
        };
        newThinkSessions.push(ts);
        thinker.activeConversationIds.push(ts.id);
        lockedCharacterIds.add(action.actorId);

        allEvents.push({
          id: `evt-${randomUUID().slice(0, 8)}`,
          worldId,
          tick: fromTick,
          category: "inner",
          description: action.freeText || "开始沉思",
          participants: [action.actorId],
          source: "think",
          intensity: 2,
          scope: "private",
          audienceCharacterId: action.actorId,
          duration: 1,
        });
      }
    }
  }

  // Run first tick of thinking for new sessions
  for (const ts of newThinkSessions) {
    const thinker = characters.find((c) => c.id === ts.characterId);
    if (!thinker) continue;
    const here = nodeById.get(thinker.locationId);
    if (!here) continue;

    const transcript: ThinkTurn[] = [...ts.transcript];

    // Inject time reminder before this tick's think rounds
    transcript.push({
      kind: "thought",
      text: injectThinkTimeMessage({
        tick: fromTick,
        epoch: world.epoch,
        tickStarted: ts.tickStarted,
        language,
      }),
    });

    for (let round = 0; round < THINK_TURNS_PER_TICK; round++) {
      let result;
      try {
        result = await llmThink({
          self: thinker,
          here,
          transcript,
          language,
          tick: fromTick,
          epoch: world.epoch,
          tickStarted: ts.tickStarted,
          previousMessages: ts.sharedMessages,
          previousTranscriptLength: ts.sharedMessagesTranscriptLength,
          allCharacters: characters,
          worldDescription: manifest.description,
          nodes,
        });
      } catch (err) {
        log.error("llmThink 异常（新会话）", {
          character: thinker.name,
          error: err instanceof Error ? err.message : String(err),
        });
        ts.status = "ended";
        break;
      }

      if (result.messages) ts.sharedMessages = result.messages;
      if (result.transcriptLength !== undefined) ts.sharedMessagesTranscriptLength = result.transcriptLength;

      if (result.kind === "turn") {
        transcript.push(result.turn);
        thinker.emotion.social_satiety = Math.max(-4, thinker.emotion.social_satiety - 0.4);
      } else {
        thinker.shortMemory.push({
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick: fromTick,
          importance: 3,
          content: `我沉思了一番：${result.summary}`,
          layer: "short",
        });
        ts.summary = result.summary;
        ts.status = "ended";
        break;
      }
    }

    ts.transcript = transcript;
    ts.currentTickRounds = THINK_TURNS_PER_TICK;

    // Persist
    if (ts.status === "ended") {
      const t = characters.find((c) => c.id === ts.characterId);
      if (t) {
        t.activeConversationIds = t.activeConversationIds.filter((id) => id !== ts.id);
      }
      const summary = ts.summary ?? "沉思结束";
      allEvents.push({
        id: `evt-${randomUUID().slice(0, 8)}`,
        worldId,
        tick: fromTick,
        category: "inner",
        description: summary,
        participants: [ts.characterId],
        source: "think",
        intensity: 2,
        scope: "private",
        audienceCharacterId: ts.characterId,
        duration: 1,
        thinkTranscript: ts.transcript,
        thinkEndedBy: ts.summary ? "natural" : "interrupted",
      });
    } else {
      saveThinkSession(ts);
    }
  }

  // Phase 4.5.5: Per-tick social_satiety
  for (const c of characters) {
    if (c.activeConversationIds.length > 0) {
      c.emotion.social_satiety = Math.max(-4, Math.min(4,
        c.emotion.social_satiety + getSocialGainPerDialogTick(c.personality.ei),
      ));
    } else {
      c.emotion.social_satiety = Math.max(-4, Math.min(4,
        c.emotion.social_satiety - getSocialDecayPerTick(c.personality.ei),
      ));
    }
  }

  // Phase 4.6: Memory compression for characters going to sleep
  const sleepActionsForCompression = actionsForExecution.filter(a => a.type === "sleep");
  if (sleepActionsForCompression.length > 0) {
    await Promise.all(
      sleepActionsForCompression.map(async (action) => {
        const c = characters.find(ch => ch.id === action.actorId);
        if (c) {
          await compressSleepMemories(c, fromTick, world.epoch, language);
        }
      }),
    );
  }

  // 7. 执行
  const execResult = executeActions({
    worldId,
    tick: fromTick,
    epoch: world.epoch,
    characters,
    nodes,
    actions: actionsForExecution,
    shops,
    itemDefs,
  });
  allEvents.push(...execResult.events);

  // 同步 success/reason 到 allDecisions
  for (let i = 0; i < execResult.resolvedActions.length; i++) {
    const r = execResult.resolvedActions[i];
    if (allDecisions[i] && allDecisions[i].action === r.action) {
      allDecisions[i].success = r.success;
    }
  }

  // Handle employment changes from manage_employment actions
  for (const resolved of execResult.resolvedActions) {
    if (resolved.action.type === "manage_employment" && resolved.success) {
      const shop = shops.find(
        (s) => s.ownerCharacterId === resolved.action.actorId,
      );
      if (shop && resolved.action.targetId) {
        if (shop.employeeCharacterId === resolved.action.targetId) {
          // Fire: target is current employee
          updateShopEmployment(shop.id, null);
          shop.employeeCharacterId = undefined;
        } else if (!shop.employeeCharacterId) {
          // Hire: no current employee
          updateShopEmployment(shop.id, resolved.action.targetId);
          shop.employeeCharacterId = resolved.action.targetId;
        }
      }
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
  } finally {
    _activeTicks.delete(lockKey);
  }
}
