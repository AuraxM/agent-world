/**
 * 执行 Action：改世界状态、写记忆、产生衍生 WorldEvent。
 *
 * 冲突仲裁 v0：同 (action_type, targetId|targetNodeId) 在同一 tick 多次出现时，
 * 仅首个生效，后到的标记为 failed，并写一条"未能成功"的内心记忆。
 *
 * Stage 1 ≤ 5 NPC，冲突极少发生；这里实现保留接口正确性。
 */
import { randomUUID } from "node:crypto";
import { applyEmotionEvent, clamp, resetVital } from "./vitals-emotion";
import type {
  Action,
  Character,
  MapNode,
  Memory,
  Relation,
  RelationChangeType,
  WorldEvent,
} from "@/domain/types";
import type {
  ActionType,
  EventCategory,
  ObjectiveRelationKind,
} from "@/domain/enums";
import { BLOOD_RELATION_KINDS, TICKS_PER_HOUR } from "@/domain/enums";

const SHORT_MEMORY_LIMIT = 50;
const SLEEP_DURATION = 8 * TICKS_PER_HOUR; // 40 ticks
const SLEEP_INTERRUPT_THRESHOLD = 4 as const;
const NAP_DURATION = 4 * TICKS_PER_HOUR; // 20 ticks
const NAP_INTERRUPT_THRESHOLD = 3 as const;

interface ExecuteInput {
  worldId: string;
  tick: number;
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

const EXCLUSIVE_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
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

function updateAffection(
  actor: Character,
  targetId: string,
  delta: number,
  tick: number,
): void {
  const rel = actor.relations[targetId];
  if (!rel) return;
  rel.affection = clamp(rel.affection + delta, -4, 4);
  rel.lastInteractionTick = tick;
}

export function executeActions(input: ExecuteInput): ExecuteResult {
  const { worldId, tick, characters, nodes, actions } = input;
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

    let success = true;
    let reason: string | undefined;

    switch (action.type) {
      case "move": {
        if (!action.targetNodeId) {
          success = false;
          reason = "move 缺少 target_node_id";
          break;
        }
        const target = nodeById.get(action.targetNodeId);
        if (!target) {
          success = false;
          reason = `目标节点不存在: ${action.targetNodeId}`;
          break;
        }
        const fromId = actor.locationId;
        actor.locationId = target.id;
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 从 ${nodeById.get(fromId)?.name ?? fromId} 来到 ${target.name}。`,
            participants: [actor.id],
            intensity: 1,
            scope: "node",
            nodeId: target.id,
          }),
        );
        break;
      }
      case "eat": {
        const here = nodeById.get(actor.locationId);
        if (!here?.tags.includes("dining")) {
          success = false;
          reason = "当前不在用餐场所";
          break;
        }
        resetVital(actor, "hunger");
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 吃了一顿。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
          }),
        );
        break;
      }
      case "rest": {
        actor.vitals.fatigue = Math.max(0, actor.vitals.fatigue - 2);
        const here = nodeById.get(actor.locationId);
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here?.name ?? "某处"} 休息了一会儿。`,
            participants: [actor.id],
            scope: "node",
            nodeId: actor.locationId,
          }),
        );
        break;
      }
      case "sleep": {
        const here = nodeById.get(actor.locationId);
        if (
          !(here?.tags.includes("residence") || here?.privacy === "private")
        ) {
          success = false;
          reason = "当前位置不能睡觉";
          break;
        }
        actor.currentAction = {
          type: "sleep",
          startedAt: tick,
          endsAt: tick + SLEEP_DURATION,
          description: `在 ${here.name} 睡觉`,
          interruptThreshold: SLEEP_INTERRUPT_THRESHOLD,
        };
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 躺下准备睡觉。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
          }),
        );
        break;
      }
      case "nap": {
        // 4 小时小睡：白天补觉。挂 currentAction 4h，期间 vitals 冻结。
        // 完成时一次性 -6 fatigue（执行 finalize 在 tick.ts:6b）；中断按已睡时长按比例扣。
        // interruptThreshold=3 < sleep 的 4，所以更易被打断——小睡本就轻浅。
        const here = nodeById.get(actor.locationId);
        if (
          !(here?.tags.includes("residence") || here?.privacy === "private")
        ) {
          success = false;
          reason = "当前位置不能小睡";
          break;
        }
        actor.currentAction = {
          type: "nap",
          startedAt: tick,
          endsAt: tick + NAP_DURATION,
          description: `在 ${here.name} 小睡`,
          interruptThreshold: NAP_INTERRUPT_THRESHOLD,
        };
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 蜷起来打个盹。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
            intensity: 1,
          }),
        );
        break;
      }
      case "bathe": {
        const here = nodeById.get(actor.locationId);
        if (!here?.tags.includes("bathing")) {
          success = false;
          reason = "当前位置不能洗浴";
          break;
        }
        resetVital(actor, "hygiene");
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 洗了个澡。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
          }),
        );
        break;
      }
      case "exercise": {
        const here = nodeById.get(actor.locationId);
        if (
          !(here?.tags.includes("outdoor") || here?.tags.includes("playground"))
        ) {
          success = false;
          reason = "当前位置不能运动";
          break;
        }
        actor.emotion.mood = clamp(actor.emotion.mood + 1, -4, 4);
        actor.emotion.stress = clamp(actor.emotion.stress - 1, 0, 4);
        actor.vitals.fatigue = Math.min(16, actor.vitals.fatigue + 2);
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 运动了一会儿。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
            intensity: 1,
          }),
        );
        break;
      }
      case "meditate": {
        const here = nodeById.get(actor.locationId);
        if (!(here?.privacy === "private" || here?.tags.includes("quiet"))) {
          success = false;
          reason = "当前位置不适合冥想";
          break;
        }
        actor.emotion.stress = clamp(actor.emotion.stress - 2, 0, 4);
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 闭目冥想。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
            intensity: 1,
          }),
        );
        break;
      }
      case "write": {
        const here = nodeById.get(actor.locationId);
        if (!here?.tags.includes("indoor")) {
          success = false;
          reason = "当前位置不适合书写";
          break;
        }
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 写了点东西${
              action.freeText ? `：${action.freeText}` : ""
            }。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
            intensity: 1,
          }),
        );
        break;
      }
      case "groom": {
        const here = nodeById.get(actor.locationId);
        if (
          !(here?.tags.includes("residence") || here?.privacy === "private")
        ) {
          success = false;
          reason = "当前位置不适合整理仪容";
          break;
        }
        actor.vitals.hygiene = Math.max(0, actor.vitals.hygiene - 1);
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here.name} 整理仪容。`,
            participants: [actor.id],
            scope: "node",
            nodeId: here.id,
            intensity: 1,
          }),
        );
        break;
      }
      case "pace": {
        const here = nodeById.get(actor.locationId);
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 在 ${here?.name ?? "某处"} 来回踱步。`,
            participants: [actor.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: 1,
          }),
        );
        break;
      }
      case "speak": {
        // speak 不应到达 execute（dialog 阶段已替换为占位 wait）
        success = false;
        reason = "speak action 未被 dialog 阶段处理——防御性回退";
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 欲言又止。`,
            participants: [actor.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: 1,
          }),
        );
        break;
      }
      case "attack":
      case "help":
      case "gift":
      case "interact_person": {
        const target = action.targetId ? charById.get(action.targetId) : null;
        if (!target) {
          success = false;
          reason = "target_id 不存在或未指定";
          break;
        }
        const verbs: Record<string, string> = {
          attack: "挑衅了",
          help: "帮助了",
          gift: "送给了",
          interact_person: "与之互动：",
        };
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "social",
            description: `${actor.name} ${verbs[action.type]} ${target.name}${
              action.freeText ? `（${action.freeText}）` : ""
            }`,
            participants: [actor.id, target.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: action.type === "attack" ? 4 : 2,
          }),
        );

        if (action.type === "attack") {
          updateAffection(actor, target.id, -2, tick);
          updateAffection(target, actor.id, -2, tick);
          applyEmotionEvent(actor.emotion, "attacked_other");
          applyEmotionEvent(target.emotion, "attacked_self");
        } else if (action.type === "help" || action.type === "gift") {
          updateAffection(actor, target.id, 1, tick);
          updateAffection(target, actor.id, 1, tick);
          applyEmotionEvent(actor.emotion, "helped_gifted");
          applyEmotionEvent(target.emotion, "received_help_gift");
        } else {
          // interact_person: just update lastInteractionTick if relations exist
          if (actor.relations[target.id]) {
            actor.relations[target.id].lastInteractionTick = tick;
          }
          if (target.relations[actor.id]) {
            target.relations[actor.id].lastInteractionTick = tick;
          }
        }

        pushMemory(target, {
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick,
          importance: action.type === "attack" ? 4 : 2,
          content: `${actor.name} ${verbs[action.type]} 我${
            action.freeText ? `（${action.freeText}）` : ""
          }`,
        });
        break;
      }
      case "flee": {
        const here = nodeById.get(actor.locationId);
        const fallback = here?.parentId ? nodeById.get(here.parentId) : null;
        if (fallback) actor.locationId = fallback.id;
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 仓促离开。`,
            participants: [actor.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: 2,
          }),
        );
        break;
      }
      case "update_relation": {
        const target = action.targetId ? charById.get(action.targetId) : null;
        if (!target || !action.changeType) {
          success = false;
          reason = "update_relation 需要 target_id 和 change_type";
          break;
        }
        const result = applyRelationChange(
          actor,
          target,
          action.changeType,
          tick,
        );
        success = result.success;
        reason = result.reason;
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "social",
            description: `${actor.name} ${
              result.success ? "变更了与" : "试图变更与"
            } ${target.name} 的关系：${action.changeType}${
              result.reason ? `（${result.reason}）` : ""
            }`,
            participants: [actor.id, target.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: result.success ? 3 : 1,
          }),
        );
        break;
      }
      case "work":
      case "read":
      case "observe":
      case "use_ability":
      case "interact_object": {
        const here = nodeById.get(actor.locationId);
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} ${humanVerb(action.type)}：${
              action.freeText ?? "（默不作声）"
            }`,
            participants: [actor.id],
            scope: "node",
            nodeId: here?.id ?? actor.locationId,
            intensity: 1,
          }),
        );
        break;
      }
      case "wait": {
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 静静地等着。`,
            participants: [actor.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: 1,
          }),
        );
        break;
      }
    }

    pushMemory(
      actor,
      memFromAction(tick, action, success ? "我刚刚" : "我尝试但失败"),
    );

    // Write arrival memory if this action was triggered by a move arrival
    if (action.isArrivalAction && action.arrivalNodeName) {
      const arrivalContent = success
        ? `${actor.name} 到达了 ${action.arrivalNodeName}，开始 ${action.type}`
        : `${actor.name} 到达了 ${action.arrivalNodeName}，但 ${reason ?? "执行失败"}`;
      pushMemory(actor, {
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick,
        importance: 3,
        content: arrivalContent,
      });
    }

    resolvedActions.push({ action, success, reason });
  }

  return { events, resolvedActions };
}

function humanVerb(type: ActionType): string {
  switch (type) {
    case "work":
      return "在工作/学习";
    case "read":
      return "在阅读";
    case "observe":
      return "在观察";
    case "use_ability":
      return "施展能力";
    case "interact_object":
      return "摆弄物件";
    default:
      return type;
  }
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
      updateAffection(actor, target.id, 1, tick);
      updateAffection(target, actor.id, 1, tick);
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
      updateAffection(actor, target.id, -1, tick);
      updateAffection(target, actor.id, -1, tick);
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
      affection: 0,
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
