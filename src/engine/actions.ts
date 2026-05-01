/**
 * 根据角色当前位置 / 状态 / 关系，构造"可选行动"列表。
 *
 * 该列表喂给 LLM 作为参考；LLM 不被强制只能选其中之一（约束在 ActionType 封闭枚举层面）。
 * 每个候选附一段简短上下文提示，目的是给 LLM 充分信息做差异化选择。
 *
 * v0.2 反扎堆改进：通过可选 `hints` 参数把 facts / 是否睡眠时段 喂进来，
 * 在 hint 文本里加 ⭐ 推荐 / "你不饿" / "已聊 N 小时" 等情境后缀。
 * 不改变行动**可选性**，仅丰富文本，避免压缩 LLM 自由度。
 */
import type { AggregatedFacts } from "./facts";
import type { Character, MapNode } from "@/domain/types";
import type { ActionType } from "@/domain/enums";

export interface ActionOption {
  type: ActionType;
  /** 简短提示，例如 "前往 阳光中学（公共, 户外）" */
  hint: string;
  /** 可选目标 id，便于 LLM 直接复用 */
  targetId?: string;
  targetNodeId?: string;
}

export interface AvailableActionsHints {
  facts?: AggregatedFacts;
  /** 来自 prompt.timeOfDay(tick).isSleepHour，避免 actions.ts 反向依赖 prompt.ts */
  isSleepHour?: boolean;
}

export interface ActionContext {
  self: Character;
  here: MapNode;
  /** 同节点其他角色 */
  companions: Character[];
  /** 可前往的相邻节点（父 + 兄弟 + 子 + shortcuts） */
  reachable: MapNode[];
}

export function buildActionContext(
  character: Character,
  nodes: MapNode[],
  characters: Character[],
): ActionContext {
  const here = nodes.find((n) => n.id === character.locationId);
  if (!here) {
    throw new Error(
      `character ${character.id} located at unknown node ${character.locationId}`,
    );
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const reachable: MapNode[] = [];
  // parent
  if (here.parentId) {
    const p = byId.get(here.parentId);
    if (p) reachable.push(p);
    // siblings
    for (const n of nodes) {
      if (n.parentId === here.parentId && n.id !== here.id) reachable.push(n);
    }
  }
  // children
  for (const n of nodes) {
    if (n.parentId === here.id) reachable.push(n);
  }
  // shortcuts
  for (const sid of here.shortcuts) {
    const s = byId.get(sid);
    if (s) reachable.push(s);
  }

  const companions = characters.filter(
    (c) => c.id !== character.id && c.locationId === here.id,
  );
  return { self: character, here, companions, reachable };
}

export function getAvailableActions(
  ctx: ActionContext,
  hints?: AvailableActionsHints,
): ActionOption[] {
  const { self, here, companions, reachable } = ctx;
  const facts = hints?.facts;
  const isSleepHour = hints?.isSleepHour ?? false;
  const fatigue = self.vitals.fatigue;
  const hunger = self.vitals.hunger;
  const stayHours = facts?.hoursAtCurrentLocation ?? 0;
  const homeNodeId = facts?.homeNodeId ?? null;
  const opts: ActionOption[] = [];

  const restNeeded = fatigue >= 10;
  const sleepStuckOutside =
    isSleepHour &&
    !(here.tags.includes("residence") || here.privacy === "private");
  const tooLongHere =
    stayHours >= 8 &&
    !here.tags.includes("residence") &&
    !here.tags.includes("education");

  // 永远可用
  opts.push({
    type: "wait",
    hint:
      restNeeded || sleepStuckOutside
        ? "什么都不做，原地等待。（你应该休息，wait 并不解决疲劳）"
        : "什么都不做，原地等待。",
  });
  opts.push({
    type: "observe",
    hint: `观察 ${here.name} 的环境与人。`,
  });

  // move：到每个相邻节点
  for (const n of reachable) {
    let hint = `前往 ${n.name}（${n.privacy}, ${n.tags.join("/")}）`;
    const isHome = homeNodeId !== null && n.id === homeNodeId;
    if (isHome && (restNeeded || sleepStuckOutside)) {
      hint = `⭐ ${hint}——这是你的家，可以休息`;
    } else if (
      tooLongHere &&
      (n.tags.includes("residence") || n.tags.includes("park"))
    ) {
      hint = `${hint}（你已在此地待 ${stayHours} 小时，换个环境是合理的）`;
    }
    opts.push({ type: "move", targetNodeId: n.id, hint });
  }

  // 进食：当前节点是 dining
  if (here.tags.includes("dining")) {
    const eatHint =
      hunger <= 0
        ? `在 ${here.name} 进食。（你并不饿，吃饭只是为了打发时间）`
        : `在 ${here.name} 进食。`;
    opts.push({ type: "eat", hint: eatHint });
  } else if (hunger >= 5) {
    opts.push({
      type: "eat",
      hint: "你已经很饿，但当前位置不能吃饭——可以选择 move 去饭馆。",
    });
  }

  // 休息：私人住宅
  if (here.tags.includes("residence") || here.privacy === "private") {
    const restHint =
      restNeeded || isSleepHour
        ? `⭐ 在 ${here.name} 休息（你确实需要）。`
        : `在 ${here.name} 休息。`;
    opts.push({ type: "rest", hint: restHint });
  }

  // 工作 / 学习：教育场所
  if (here.tags.includes("education")) {
    opts.push({ type: "work", hint: `在 ${here.name} 学习/工作。` });
  }

  // 阅读：公共/室内场所均可
  if (here.tags.includes("indoor")) {
    opts.push({ type: "read", hint: `在 ${here.name} 安静阅读。` });
  }

  // 与同节点其他角色互动
  const speakSuffix =
    stayHours >= 4 && companions.length > 0
      ? `（你已在此和他们待 ${stayHours} 小时，话题可能开始重复）`
      : "";
  for (const peer of companions) {
    const rel = self.relations[peer.id];
    const relTag = rel ? `${rel.kind}, 好感 ${rel.affinity}` : "陌生";
    opts.push({
      type: "speak",
      targetId: peer.id,
      hint: `和 ${peer.name}（${relTag}）说话。${speakSuffix}`,
    });
    opts.push({
      type: "interact_person",
      targetId: peer.id,
      hint: `与 ${peer.name}（${relTag}）做出非言语互动。`,
    });
    if (rel && rel.affinity > 30) {
      opts.push({
        type: "help",
        targetId: peer.id,
        hint: `帮助 ${peer.name}。`,
      });
      opts.push({
        type: "gift",
        targetId: peer.id,
        hint: `送 ${peer.name} 一件小东西。`,
      });
    }
    if (rel && (rel.kind === "enemy" || rel.kind === "rival")) {
      opts.push({
        type: "attack",
        targetId: peer.id,
        hint: `挑衅或攻击 ${peer.name}。`,
      });
      opts.push({
        type: "flee",
        targetId: peer.id,
        hint: `避开 ${peer.name}。`,
      });
    }
  }

  // 通用兜底
  opts.push({
    type: "interact_object",
    hint: `与 ${here.name} 中的某件物品互动（自由文本描述）。`,
  });
  opts.push({ type: "use_ability", hint: "使用你的某项能力（自由文本描述）。" });

  return opts;
}
