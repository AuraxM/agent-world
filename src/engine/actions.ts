/**
 * 根据角色当前位置 / vitals / emotion / 关系，构造"可选行动"列表。
 *
 * 该列表喂给 LLM 作为参考；LLM 不被强制只能选其中之一（约束在 ActionType 封闭枚举层面）。
 * 每个候选附一段简短上下文提示，目的是给 LLM 充分信息做差异化选择。
 *
 * 反扎堆改进：通过可选 `hints` 参数把 facts / 是否睡眠时段 喂进来，
 * 在 hint 文本里加 ⭐ 推荐 / "你不饿" / "已聊 N 小时" 等情境后缀。
 * 不改变行动**可选性**，仅丰富文本，避免压缩 LLM 自由度。
 */
import type { AggregatedFacts } from "./facts";
import type { Character, MapNode } from "@/domain/types";
import type { ActionType } from "@/domain/enums";
import { BLOOD_RELATION_KINDS } from "@/domain/enums";

export interface ActionOption {
  type: ActionType;
  /** 简短提示，例如 "前往 酒馆「雪灯」" */
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
  /** 所有地图节点（不含当前位置） */
  reachable: MapNode[];
}

// vitals 阈值：与 vitals-emotion.ts 保持同步。
const HYGIENE_MEDIUM = 8;
const HYGIENE_SEVERE = 13;

export function buildActionContext(
  character: Character,
  nodes: MapNode[],
  characters: Character[],
  /** 并发 tick 时传入各角色的位置快照；不传则读 character.locationId */
  locationOverrides?: ReadonlyMap<string, string>,
): ActionContext {
  const loc = locationOverrides?.get(character.id) ?? character.locationId;
  const here = nodes.find((n) => n.id === loc);
  if (!here) {
    throw new Error(
      `character ${character.id} located at unknown node ${loc}`,
    );
  }

  const companions = characters.filter(
    (c) =>
      c.id !== character.id &&
      (locationOverrides?.get(c.id) ?? c.locationId) === loc,
  );

  const reachable = nodes.filter((n) => n.id !== loc);

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
  const hygiene = self.vitals.hygiene;
  const stress = self.emotion.stress;
  const stayHours = facts?.hoursAtCurrentLocation ?? 0;
  const homeNodeId = facts?.homeNodeId ?? null;
  const opts: ActionOption[] = [];

  // 12 起才算"必须休息"——10 那档（high "困倦"）只是文字提示，不上 ⭐。
  // 这样下午 fatigue=10 不会被强引导回家睡觉，把决定权交回 LLM。
  const restNeeded = fatigue >= 12;
  const sleepStuckOutside =
    isSleepHour &&
    !(here.tags.includes("residence") || here.privacy === "private");
  // 永远可用——hint 不重复 here.name（user prompt 上方已有"你现在的位置"）。
  opts.push({
    type: "wait",
    hint:
      restNeeded || sleepStuckOutside
        ? "原地等待（wait 并不解决疲劳）。"
        : "原地等待。",
  });
  opts.push({ type: "observe", hint: "观察当前环境与人。" });
  opts.push({ type: "pace", hint: "踱步，整理思绪。" });

  // move：推荐目的地（高亮 home、dining、bathing）
  const highlighted = new Set<string>();
  if (homeNodeId) highlighted.add(homeNodeId);
  for (const n of reachable) {
    if (n.tags.includes("dining") || n.tags.includes("bathing")) {
      highlighted.add(n.id);
    }
  }

  for (const nId of highlighted) {
    const n = reachable.find((r) => r.id === nId);
    if (!n) continue;
    const isHome = homeNodeId !== null && n.id === homeNodeId;
    let hint = `前往 ${n.name}`;
    if (isHome && (restNeeded || sleepStuckOutside)) {
      hint = `⭐ ${hint}——你的家，可以休息`;
    } else if (n.tags.includes("dining") && hunger >= 5) {
      hint = `⭐ ${hint}——可以用餐`;
    } else if (n.tags.includes("bathing") && hygiene >= HYGIENE_MEDIUM) {
      hint = `⭐ ${hint}——可以洗浴`;
    }
    opts.push({ type: "move", targetNodeId: n.id, hint });
  }

  // Generic move hint
  opts.push({
    type: "move",
    hint: "前往地图上任意地点（指定 target_node_id + reason + arrival_action）。",
  });

  // 进食：当前节点是 dining
  if (here.tags.includes("dining")) {
    const eatHint =
      hunger <= 0
        ? "进食（你并不饿，仅打发时间）。"
        : hunger >= 10
          ? `⭐ 进食（你已经 ${hunger} 小时未进食）。`
          : hunger >= 5
            ? "⭐ 进食。"
            : "进食。";
    opts.push({ type: "eat", hint: eatHint });
  } else if (hunger >= 5) {
    opts.push({
      type: "eat",
      hint: "你已经很饿，但当前位置不能吃饭——可以选择 move 去饭馆。",
    });
  }

  // 休息：私人住宅
  if (here.tags.includes("residence") || here.privacy === "private") {
    // rest 是温和动作（-2 fatigue），推得宽：累或到点都 ⭐。
    const restHint =
      restNeeded || isSleepHour ? "⭐ 休息（你确实需要）。" : "休息。";
    opts.push({ type: "rest", hint: restHint });

    // sleep（8h）只在作息窗口内提供；窗口外用 nap（4h）替代。
    if (isSleepHour) {
      opts.push({
        type: "sleep",
        hint: "⭐ 睡觉（连续 8 小时，期间不被 intensity < 4 的事件打断）。",
      });
    } else {
      opts.push({
        type: "nap",
        hint: restNeeded
          ? "⭐ 小睡 4 小时（白天补觉用，效果较弱；不是正经睡眠）。"
          : "小睡 4 小时。",
      });
    }

    // 整理仪容
    opts.push({
      type: "groom",
      hint: hygiene >= HYGIENE_SEVERE ? "⭐ 整理仪容。" : "整理仪容。",
    });
  }

  // 洗浴
  if (here.tags.includes("bathing")) {
    opts.push({
      type: "bathe",
      hint:
        hygiene >= HYGIENE_MEDIUM
          ? `⭐ 洗浴（你已经 ${hygiene} 小时没洗澡了）。`
          : "洗浴。",
    });
  }

  // 运动
  if (here.tags.includes("outdoor") || here.tags.includes("playground")) {
    opts.push({
      type: "exercise",
      hint: "运动一下（+mood, -stress, +fatigue）。",
    });
  }

  // 冥想
  if (here.privacy === "private" || here.tags.includes("quiet")) {
    opts.push({
      type: "meditate",
      hint: stress >= 3 ? "⭐ 冥想放松（缓解压力）。" : "冥想。",
    });
  }

  // 写作 / 阅读：室内
  if (here.tags.includes("indoor")) {
    opts.push({ type: "write", hint: "写点东西（mood 依自评变化）。" });
    opts.push({ type: "read", hint: "安静阅读。" });
  }

  // 工作 / 学习：教育场所
  if (here.tags.includes("education")) {
    opts.push({ type: "work", hint: "学习/工作。" });
  }

  // 与同节点其他角色互动——关系 / 好感已在 user prompt 的"同节点其他人物"段
  // 完整列出，hint 不重复 relTag。
  const requestSuffix =
    stayHours >= 4 && companions.length > 0
      ? `（你已在此和他们待 ${stayHours} 小时，话题可能开始重复）`
      : "";
  for (const peer of companions) {
    const rel = self.relations[peer.id];
    opts.push({
      type: "speak",
      targetId: peer.id,
      hint: `和 ${peer.name} 聊几句（在 freeText 里写你想说的）。${requestSuffix}`,
    });
    opts.push({
      type: "interact_person",
      targetId: peer.id,
      hint: `与 ${peer.name} 做出非言语互动。`,
    });
    if (rel && rel.affection > 1) {
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
    if (rel && rel.affection < -1) {
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

    // update_relation：仅对存在非血缘关系的对象开放
    if (rel && rel.kinds.some((k) => !BLOOD_RELATION_KINDS.has(k))) {
      const hasPartner = rel.kinds.includes("partner");
      const hasSpouse = rel.kinds.includes("spouse");
      const hasFriend = rel.kinds.includes("friend");
      if (!hasPartner && !hasSpouse) {
        opts.push({
          type: "update_relation",
          targetId: peer.id,
          hint: `提议与 ${peer.name} 成为伴侣（change_type: become_partner）。`,
        });
      }
      if (hasPartner && !hasSpouse) {
        opts.push({
          type: "update_relation",
          targetId: peer.id,
          hint: `与 ${peer.name} 升级为配偶（change_type: become_spouse）。`,
        });
        opts.push({
          type: "update_relation",
          targetId: peer.id,
          hint: `与 ${peer.name} 结束伴侣关系（change_type: end_partnership）。`,
        });
      }
      if (hasFriend) {
        opts.push({
          type: "update_relation",
          targetId: peer.id,
          hint: `与 ${peer.name} 结束友谊（change_type: end_friendship）。`,
        });
      }
      if (rel.kinds.includes("other_relative")) {
        opts.push({
          type: "update_relation",
          targetId: peer.id,
          hint: `与 ${peer.name} 解除远亲关系（change_type: end_other_relative）。`,
        });
      }
    }
  }

  // 通用兜底
  opts.push({
    type: "interact_object",
    hint: `与 ${here.name} 中的某件物品互动（自由文本描述）。`,
  });
  opts.push({
    type: "use_ability",
    hint: "使用你的某项能力（自由文本描述）。",
  });

  return opts;
}
