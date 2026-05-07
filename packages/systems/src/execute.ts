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
  MapNode,
  Memory,
  Relation,
  RelationChangeType,
  WorldEvent,
} from "@agw/domain";
import type {
  EventCategory,
  ObjectiveRelationKind,
} from "@agw/domain";
import { BLOOD_RELATION_KINDS, TICKS_PER_HOUR } from "@agw/domain";
import { actionRegistry } from "@agw/domain";
import type { Outcome, StateChange } from "@agw/domain";
import { createLogger } from "@agw/shared";
const log = createLogger("execute");

const SHORT_MEMORY_LIMIT = 50;
const SLEEP_DURATION = 8 * TICKS_PER_HOUR; // 40 ticks
const SLEEP_INTERRUPT_THRESHOLD = 4 as const;
const NAP_DURATION = 4 * TICKS_PER_HOUR; // 20 ticks
const NAP_INTERRUPT_THRESHOLD = 3 as const;

interface ExecuteInput {
  worldId: string;
  tick: number;
  epoch: number;
  characters: Character[];
  nodes: MapNode[];
  actions: Action[];
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
      facts: {} as any,  // execution doesn't need facts
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
      scheduled_day: (action as any).scheduled_day,
      scheduled_hour: (action as any).scheduled_hour,
      scheduled_minute: (action as any).scheduled_minute,
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

// ---- relation change helpers ----

function applyRelationChange(
  actor: Character,
  target: Character,
  changeType: RelationChangeType,
  tick: number,
): { success: boolean; reason?: string } {
  const aRel = actor.relations[target.id];
  const bRel = target.relations[actor.id];
  if (!aRel || aRel.kinds.length === 0) {
    return { success: false, reason: "双方没有关系基础" };
  }

  const hasBlood =
    aRel.kinds.some((k) => BLOOD_RELATION_KINDS.has(k)) ||
    (bRel?.kinds.some((k) => BLOOD_RELATION_KINDS.has(k)) ?? false);

  switch (changeType) {
    case "become_partner": {
      if (hasBlood) {
        return { success: false, reason: "血缘关系不能转为伴侣" };
      }
      addKind(actor, target.id, "partner", tick);
      addKind(target, actor.id, "partner", tick);
      return { success: true };
    }
    case "end_partnership": {
      if (!aRel.kinds.includes("partner")) {
        return { success: false, reason: "当前不是伴侣关系" };
      }
      replaceKind(actor, target.id, "partner", "ex_partner");
      replaceKind(target, actor.id, "partner", "ex_partner");
      return { success: true };
    }
    case "become_spouse": {
      if (
        !aRel.kinds.includes("partner") ||
        !(bRel?.kinds.includes("partner") ?? false)
      ) {
        return {
          success: false,
          reason: "双方必须是伴侣才能升级为配偶",
        };
      }
      replaceKind(actor, target.id, "partner", "spouse");
      replaceKind(target, actor.id, "partner", "spouse");
      return { success: true };
    }
    case "end_friendship": {
      if (!aRel.kinds.includes("friend")) {
        return { success: false, reason: "当前不是朋友关系" };
      }
      removeKind(actor, target.id, "friend");
      removeKind(target, actor.id, "friend");
      return { success: true };
    }
    case "end_other_relative": {
      if (!aRel.kinds.includes("other_relative")) {
        return { success: false, reason: "当前没有 other_relative 关系" };
      }
      removeKind(actor, target.id, "other_relative");
      removeKind(target, actor.id, "other_relative");
      return { success: true };
    }
    default:
      return { success: false, reason: "未知的 change_type" };
  }
}

function addKind(
  char: Character,
  targetId: string,
  kind: ObjectiveRelationKind,
  tick: number,
): void {
  const rel = char.relations[targetId];
  if (!rel) {
    const fresh: Relation = {
      kinds: [kind],
      since: tick,
      lastInteractionTick: tick,
    };
    char.relations[targetId] = fresh;
  } else if (!rel.kinds.includes(kind)) {
    rel.kinds.push(kind);
  }
}

function removeKind(
  char: Character,
  targetId: string,
  kind: ObjectiveRelationKind,
): void {
  const rel = char.relations[targetId];
  if (!rel) return;
  rel.kinds = rel.kinds.filter((k) => k !== kind);
  if (rel.kinds.length === 0) {
    delete char.relations[targetId];
  }
}

function replaceKind(
  char: Character,
  targetId: string,
  oldKind: ObjectiveRelationKind,
  newKind: ObjectiveRelationKind,
): void {
  const rel = char.relations[targetId];
  if (!rel) return;
  rel.kinds = rel.kinds.map((k) => (k === oldKind ? newKind : k));
}
