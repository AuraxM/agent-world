/**
 * 执行 Action：改世界状态、写记忆、产生衍生 WorldEvent。
 *
 * 冲突仲裁 v0：同 (action_type, targetId|targetNodeId) 在同一 tick 多次出现时，
 * 仅首个生效，后到的标记为 failed，并写一条"未能成功"的内心记忆。
 *
 * Stage 1 ≤ 5 NPC，冲突极少发生；这里实现保留接口正确性。
 */
import { randomUUID } from "node:crypto";
import { clamp, resetVital } from "./vitals-emotion";
import { recordTransaction } from "./economy";
import type {
  Action,
  Character,
  ItemDefinition,
  MapNode,
  Memory,
  Shop,
  WorldEvent,
} from "../domain/index";
import type { EventCategory } from "../domain/index";
import { actionRegistry } from "../domain/index";
import type { Outcome, StateChange } from "../domain/index";
import { createLogger } from "../shared/index";
const log = createLogger("execute");

const SHORT_MEMORY_LIMIT = 120;

interface ExecuteInput {
  worldId: string;
  tick: number;
  epoch: number;
  characters: Character[];
  nodes: MapNode[];
  actions: Action[];
  shops: Shop[];
  itemDefs: Map<string, ItemDefinition>;
}

export interface ExecuteResult {
  /** 成功或失败的描述事件 */
  events: WorldEvent[];
  /** 每个角色对应的最终 action（失败也保留以便记忆） */
  resolvedActions: Array<{ action: Action; success: boolean; reason?: string }>;
}

const EXCLUSIVE_TYPES: ReadonlySet<string> = new Set<string>([
  "attack",
  "interact_object",
  "interact_person",
  "gift",
]);

function makeEvent(args: {
  worldId: string;
  tick: number;
  category: EventCategory;
  description: string;
  participants: string[];
  intensity?: 1 | 2 | 3 | 4 | 5;
  scope: WorldEvent["scope"];
  nodeId?: string;
  audienceCharacterId?: string;
}): WorldEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    worldId: args.worldId,
    tick: args.tick,
    category: args.category,
    description: args.description,
    participants: args.participants,
    source: "actor",
    intensity: args.intensity ?? 2,
    scope: args.scope,
    nodeId: args.nodeId,
    audienceCharacterId: args.audienceCharacterId,
    duration: 1,
  };
}

function pushMemory(c: Character, mem: Memory) {
  c.shortMemory.push(mem);
  if (c.shortMemory.length > SHORT_MEMORY_LIMIT) {
    c.shortMemory.splice(0, c.shortMemory.length - SHORT_MEMORY_LIMIT);
  }
}

function memFromAction(tick: number, action: Action, prefix: string): Memory {
  return {
    id: `mem-${randomUUID().slice(0, 8)}`,
    tick,
    importance: action.selfImportance,
    content: `${prefix}：${action.freeText ?? action.reasoning.slice(0, 80)}`,
  };
}

export function applyStateChange(
  c: Character,
  sc: StateChange,
  worldId: string,
  tick: number,
): void {
  switch (sc.kind) {
    case "resetVital":
      resetVital(c, sc.vital);
      break;
    case "adjustVital":
      c.vitals[sc.vital] = clamp(c.vitals[sc.vital] + sc.delta, 0, 16);
      break;
    case "setLocation":
      c.locationId = sc.nodeId;
      break;
    case "adjustMood":
      c.emotion.mood = clamp(c.emotion.mood + sc.delta, -4, 4);
      break;
    case "adjustStress":
      c.emotion.stress = clamp(c.emotion.stress + sc.delta, 0, 4);
      break;
    case "adjustSocialSatiety":
      c.emotion.social_satiety = clamp(c.emotion.social_satiety + sc.delta, -4, 4);
      break;
    case "setOngoingAction":
      c.currentAction = sc.action;
      break;
    case "clearOngoingAction":
      c.currentAction = undefined;
      break;
    case "adjustMoney":
      c.money += sc.amount;
      recordTransaction(
        worldId, tick, c.id,
        sc.amount,
        sc.amount > 0 ? "income" : "expense",
        sc.reason,
      );
      break;
    case "addItem": {
      for (let i = 0; i < (sc.count ?? 1); i++) {
        c.inventory.push({ itemDefId: sc.itemDefId, acquiredTick: tick });
      }
      break;
    }
    case "removeItem": {
      const removeCount = sc.count ?? 1;
      for (let i = 0; i < removeCount; i++) {
        const idx = c.inventory.findIndex((item) => item.itemDefId === sc.itemDefId);
        if (idx !== -1) c.inventory.splice(idx, 1);
      }
      break;
    }
    case "setEmployment": {
      // Marker — actual shop DB update happens in tick.ts via updateShopEmployment()
      break;
    }
  }
}

export function executeActions(input: ExecuteInput): ExecuteResult {
  const { worldId, tick, epoch, characters, nodes, actions } = input;
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const events: WorldEvent[] = [];
  const resolvedActions: ExecuteResult["resolvedActions"] = [];

  // 冲突标记：同一 (type, targetKey) 仅第一个成功
  const claimed = new Set<string>();
  const claimKey = (a: Action) =>
    EXCLUSIVE_TYPES.has(a.type) && (a.targetId || a.targetNodeId)
      ? `${a.type}|${a.targetId ?? ""}|${a.targetNodeId ?? ""}`
      : null;

  for (const action of actions) {
    const actor = charById.get(action.actorId);
    if (!actor) {
      resolvedActions.push({
        action,
        success: false,
        reason: `actor ${action.actorId} 不存在`,
      });
      continue;
    }

    const key = claimKey(action);
    if (key && claimed.has(key)) {
      const memo = memFromAction(tick, action, "我没能赶在前面");
      pushMemory(actor, memo);
      resolvedActions.push({ action, success: false, reason: "被先到者占用" });
      events.push(
        makeEvent({
          worldId,
          tick,
          category: "action",
          description: `${actor.name} 试图 ${action.type} 但被抢了先。`,
          participants: [actor.id],
          intensity: 1,
          scope: "node",
          nodeId: actor.locationId,
        }),
      );
      continue;
    }
    if (key) claimed.add(key);

    // Engine-internal proxy actions (e.g. ongoing action placeholder) skip registry
    if (action.skipExecution) {
      if (!action.skipMemory) {
        pushMemory(actor, {
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick,
          importance: action.selfImportance,
          content: action.reasoning.slice(0, 80),
        });
      }
      log.info("执行(proxy)", { action: action.type, 角色: actor.name });
      resolvedActions.push({ action, success: true });
      continue;
    }

    // Lookup definition from registry
    const def = actionRegistry.get(action.type);
    if (!def) {
      // Unknown action type → fallback
      const memo: Memory = {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 1,
        content: `我尝试了未知的行动：${action.type}`,
      };
      pushMemory(actor, memo);
      resolvedActions.push({ action, success: false, reason: `未知action type: ${action.type}` });
      events.push(makeEvent({
        worldId, tick, category: "action",
        description: `${actor.name} 茫然地站着。`,
        participants: [actor.id], intensity: 1, scope: "node", nodeId: actor.locationId,
      }));
      continue;
    }

    // Build ActionContext for the definition
    const here = nodeById.get(actor.locationId)!;
    const ctx = {
      worldId, tick, epoch, self: actor, here,
      companions: characters.filter((c) => c.id !== actor.id && c.locationId === actor.locationId),
      reachable: nodes.filter((n) => n.id !== actor.locationId),
      isSleepHour: false,
      // execution doesn't need facts; provide an empty stub
      facts: {
        activityNodeId: null,
        activityNodeName: null,
        restNodeId: null,
        restNodeName: null,
        hoursAtCurrentLocation: 0,
        todayActionCounts: {},
        todayChatTargets: {},
      },
      shops: input.shops,
      itemDefs: input.itemDefs,
    };

    // Build ActionInput from the Action
    const actionInput = {
      target_id: action.targetId,
      target_node_id: action.targetNodeId,
      free_text: action.freeText,
      amount: action.amount,
      reason: action.reason,
      arrival_action: action.arrivalAction ? {
        action_type: action.arrivalAction.type,
        free_text: action.arrivalAction.freeText,
        target_id: action.arrivalAction.targetId,
        target_node_id: action.arrivalAction.targetNodeId,
      } : undefined,
      scheduled_day: action.scheduled_day,
      scheduled_hour: action.scheduled_hour,
      scheduled_minute: action.scheduled_minute,
    };

    // Execute via definition
    let success = true;
    let reason: string | undefined;
    let outcome: Outcome | undefined;
    try {
      outcome = def.execute(ctx, actionInput);

      // Apply state changes
      if (outcome.stateChanges) {
        for (const sc of outcome.stateChanges) {
          applyStateChange(actor, sc, worldId, tick);
          // Cross-character adjustMoney: credit target
          if (sc.kind === "adjustMoney" && sc.targetCharacterId) {
            const target = charById.get(sc.targetCharacterId);
            if (target) {
              const received = -sc.amount; // sc.amount is negative (deduction from actor)
              if (received > 0) {
                target.money += received;
                recordTransaction(worldId, tick, target.id, received, "transfer_in",
                  `收到 ${actor.name} 转账`, actor.id);
                pushMemory(target, {
                  id: `mem-${randomUUID().slice(0, 8)}`,
                  tick,
                  importance: 4,
                  content: outcome.dialogRecord
                    ? outcome.dialogRecord.replace(actor.name, `${actor.name}（对方）`)
                    : `${actor.name} 给了我 ${received} 金钱。`,
                });
              }
            }
          }
          // Opposite direction: actor receives positive adjustMoney but it's meant for target
          if (sc.kind === "adjustMoney" && sc.amount > 0 && sc.targetCharacterId) {
            const target = charById.get(sc.targetCharacterId);
            if (target) {
              target.money += sc.amount;
              recordTransaction(worldId, tick, target.id, sc.amount, "income", sc.reason);
            }
            // Reverse the credit from actor (since applyStateChange added it to actor already)
            actor.money -= sc.amount;
          }
        }
      }

      // Write memory
      if (!action.skipMemory) {
        pushMemory(actor, {
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick,
          importance: action.selfImportance,
          content: outcome.memory,
        });
      }

      // Write arrival memory
      if (action.isArrivalAction && action.arrivalNodeName) {
        pushMemory(actor, {
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick,
          importance: 3,
          content: `${actor.name} 到达了 ${action.arrivalNodeName}，开始 ${action.type}`,
        });
      }

      // Generate WorldEvent
      if (outcome.event) {
        events.push(makeEvent({
          worldId, tick,
          category: outcome.event.category,
          description: outcome.event.description,
          participants: [actor.id],
          intensity: outcome.event.intensity ?? 1,
          scope: outcome.event.scope ?? "node",
          nodeId: actor.locationId,
        }));
      }
    } catch (err) {
      success = false;
      reason = `执行失败：${err instanceof Error ? err.message : String(err)}`;
    }

    resolvedActions.push({ action, success, reason });
    if (success) {
      log.info("执行", { action: action.type, 角色: actor.name, success: true });
    } else {
      log.error("执行失败", { action: action.type, 角色: actor.name, reason: reason ?? "未知" });
    }
  }

  return { events, resolvedActions };
}

