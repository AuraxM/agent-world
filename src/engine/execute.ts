/**
 * 执行 Action：改世界状态、写记忆、产生衍生 WorldEvent。
 *
 * 冲突仲裁 v0：同 (action_type, targetId|targetNodeId) 在同一 tick 多次出现时，
 * 仅首个生效，后到的标记为 failed，并写一条"未能成功"的内心记忆。
 *
 * Stage 1 ≤ 5 NPC，冲突极少发生；这里实现保留接口正确性。
 */
import { randomUUID } from "node:crypto";
import { resetVital } from "./status-decay";
import type { Action, Character, MapNode, Memory, WorldEvent } from "@/domain/types";
import type { ActionType, EventCategory } from "@/domain/enums";

const SHORT_MEMORY_LIMIT = 50;

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

function memFromAction(
  tick: number,
  action: Action,
  prefix: string,
): Memory {
  return {
    id: `mem-${randomUUID().slice(0, 8)}`,
    tick,
    importance: action.selfImportance,
    content: `${prefix}：${action.freeText ?? action.reasoning.slice(0, 80)}`,
  };
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
        resetVital(actor, "fatigue");
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
      case "speak": {
        const here = nodeById.get(actor.locationId);
        const target = action.targetId ? charById.get(action.targetId) : null;
        const audience = target ? `对 ${target.name} ` : "";
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "social",
            description:
              `${actor.name} ${audience}说："${action.freeText ?? "（沉默良久）"}"`,
            participants: target ? [actor.id, target.id] : [actor.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: 2,
          }),
        );
        // 双方都记一笔
        if (target) {
          pushMemory(target, {
            id: `mem-${randomUUID().slice(0, 8)}`,
            tick,
            importance: 2,
            content: `${actor.name} 对我说："${action.freeText ?? "..."}"`,
          });
        }
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
        // 关系微调（粗糙规则）
        const rel = actor.relations[target.id];
        if (rel) {
          if (action.type === "attack") rel.affinity = Math.max(-100, rel.affinity - 20);
          else if (action.type === "help" || action.type === "gift")
            rel.affinity = Math.min(100, rel.affinity + 10);
        }
        // 记忆双方
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
        // flee 视为离开当前节点回到父节点（如果有）
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

    // 写入行动者自己的短期记忆
    pushMemory(actor, memFromAction(tick, action, success ? "我刚刚" : "我尝试但失败"));
    resolvedActions.push({ action, success, reason });
  }

  return { events, resolvedActions };
}

function humanVerb(type: ActionType): string {
  switch (type) {
    case "work": return "在工作/学习";
    case "read": return "在阅读";
    case "observe": return "在观察";
    case "use_ability": return "施展能力";
    case "interact_object": return "摆弄物件";
    default: return type;
  }
}
