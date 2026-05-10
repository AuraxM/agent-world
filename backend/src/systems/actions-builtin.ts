import type { ActionDefinition, StateChange } from "../domain/index";
import { TICKS_PER_HOUR } from "../domain/index";
import { getEatCost, getBatheCost } from "./bme";
import { paySalary, findEmployment, findShopAtNode, canAfford, buyItems } from "./economy";

export const eatAction: ActionDefinition = {
  type: "eat",
  duration: "instant",
  triggerHint: "感到饥饿时使用，补充能量维持身体运转。",
  paramRule: "可选 free_text。需在餐厅/食堂类地点。",
  check(ctx) {
    if (!ctx.here.tags.includes("dining")) return false;
    if (ctx.self.expenseExempt) return true;
    return ctx.self.money >= getEatCost();
  },
  hint(ctx) {
    const h = ctx.self.vitals.hunger;
    const costNote = ctx.self.expenseExempt
      ? ""
      : ` (-${getEatCost()}💰)`;
    if (h >= 11) return `⭐ 进食（已 ${Math.round(h)} 小时未进食）${costNote}`;
    if (h >= 6) return `⭐ 进食${costNote}`;
    if (h <= 0) return `进食（不饿，纯消遣）${costNote}`;
    return `进食${costNote}`;
  },
  validateParams() { return null; },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "吃了一顿饭";
    const changes: StateChange[] = [{ kind: "resetVital", vital: "hunger" }];
    if (!ctx.self.expenseExempt) {
      changes.push({
        kind: "adjustMoney",
        amount: -getEatCost(),
        reason: "eat",
      });
    }
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 2 },
      stateChanges: changes,
    };
  },
};

export const batheAction: ActionDefinition = {
  type: "bathe",
  duration: "instant",
  triggerHint: "感觉身体不干净时使用，保持个人卫生。",
  paramRule: "可选 free_text。需在浴室/洗浴类地点。",
  check(ctx) {
    if (!ctx.here.tags.includes("bathing")) return false;
    if (ctx.self.expenseExempt) return true;
    return ctx.self.money >= getBatheCost();
  },
  hint(ctx) {
    const h = ctx.self.vitals.hygiene;
    const costNote = ctx.self.expenseExempt
      ? ""
      : ` (-${getBatheCost()}💰)`;
    if (h >= 13) return `⭐ 洗浴（已 ${Math.round(h)} 小时未洗浴）${costNote}`;
    if (h >= 8) return `⭐ 洗浴${costNote}`;
    return `洗浴${costNote}`;
  },
  validateParams() { return null; },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "洗了个澡";
    const changes: StateChange[] = [{ kind: "resetVital", vital: "hygiene" }];
    if (!ctx.self.expenseExempt) {
      changes.push({
        kind: "adjustMoney",
        amount: -getBatheCost(),
        reason: "bathe",
      });
    }
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 1 },
      stateChanges: changes,
    };
  },
};

export const restAction: ActionDefinition = {
  type: "rest",
  duration: 5,
  triggerHint: "疲惫但不在睡眠时段时使用，在住处或隐私空间短暂休息。",
  paramRule: "无需额外参数。持续 5 ticks，可被打断。",
  check(ctx) {
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint(ctx) {
    return ctx.self.vitals.fatigue >= 12 || ctx.isSleepHour ? "⭐ 休息 (5 ticks)" : "休息 (5 ticks)";
  },
  validateParams() { return null; },
  execute(ctx, _input) {
    return {
      memory: `我在 ${ctx.here.name} 开始休息。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 坐下休息。`, intensity: 1 },
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "rest",
          startedAt: ctx.tick,
          endsAt: ctx.tick + 5,
          description: `在 ${ctx.here.name} 休息`,
          interruptThreshold: 2,
        },
      }],
    };
  },
  onComplete(ctx) {
    return {
      memory: `我在 ${ctx.here.name} 休息好了。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 休息完毕。`, intensity: 1 },
      stateChanges: [{ kind: "adjustVital", vital: "fatigue", delta: -(ctx.self.health) }],
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `我休息时被打断了——${reason}`,
      event: { category: "action", description: `${ctx.self.name} 的休息被打断。`, intensity: 2 },
    };
  },
};

export const workAction: ActionDefinition = {
  type: "work",
  duration: 10,
  triggerHint: "在雇佣你的店铺工作，完成 10 tick 后获得工资。",
  paramRule: "可选 free_text。需在雇佣你的店铺节点。",
  check(ctx) {
    const emp = findEmployment(ctx.self, ctx.shops);
    if (!emp) return false;
    return ctx.here.id === emp.nodeId;
  },
  hint(ctx) {
    const emp = findEmployment(ctx.self, ctx.shops);
    if (!emp) return "工作（未被雇佣）";
    return `工作（${ctx.here.name}，${emp.salary}💰/次，10 ticks）`;
  },
  validateParams() { return null; },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "开始工作";
    const emp = findEmployment(ctx.self, ctx.shops)!;
    return {
      memory: `我在 ${ctx.here.name} 开始工作：${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 开始工作。`, intensity: 1 },
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "work",
          startedAt: ctx.tick,
          endsAt: ctx.tick + 10,
          description: `在 ${ctx.here.name} 工作`,
          interruptThreshold: 3,
        },
      }],
    };
  },
  onComplete(ctx) {
    const emp = findEmployment(ctx.self, ctx.shops);
    if (!emp) return { memory: "我完成了工作但店铺已不存在。", stateChanges: [] };
    const changes = paySalary(ctx.worldId, ctx.tick, ctx.self, emp);
    return {
      memory: `我完成了工作，收到 ${emp.salary}💰 工资。`,
      event: { category: "action", description: `${ctx.self.name} 完成了工作。`, intensity: 2 },
      stateChanges: changes,
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `工作被打断——${reason}，没有收入。`,
      event: { category: "action", description: `${ctx.self.name} 的工作被打断。`, intensity: 3 },
    };
  },
};

export const thinkAction: ActionDefinition = {
  type: "think",
  duration: "instant",
  triggerHint: "想一个人静静、回顾记忆整理思绪时使用。",
  paramRule: "可选 free_text（思考内容，越具体记忆质量越高）。",
  check(_ctx) {
    return true;
  },
  hint(ctx) {
    const peers = ctx.companions.map((c) => c.name).join("、");
    const base = `沉思（你在 ${ctx.here.name}`;
    if (peers) return `${base}，身边有 ${peers}）`;
    if (ctx.here.tags.includes("outdoor")) return `${base}，户外空气清新）`;
    return `${base}，独自一人）`;
  },
  validateParams() { return null; },
  execute(ctx, input) {
    const thought = (input.free_text as string) || "默然思索";
    return {
      memory: `我沉思：${thought}`,
      event: { category: "inner", description: `${ctx.self.name} 在 ${ctx.here.name} 若有所思。`, intensity: 1 },
    };
  },
};

export const chatAction: ActionDefinition = {
  type: "chat",
  duration: "instant",
  triggerHint: "身边有人、想发起对话交流时使用。",
  paramRule: "必填 target_id（说话对象）+ free_text（说什么）。",
  check(ctx) {
    if (ctx.companions.length === 0) return false;
    // 对话结束后冷却 1 tick，禁止连续对话
    if (ctx.self.lastConversationEndTick > 0 && ctx.tick - ctx.self.lastConversationEndTick <= 1) return false;
    return true;
  },
  hint(ctx) {
    if (ctx.companions.length === 0) return "（没有可以说话的人）";
    return ctx.companions.map((c) => ({
      hint: `和 ${c.name} 交谈`,
      targetId: c.id,
    }));
  },
  validateParams(input, ctx) {
    if (!input.target_id) return "chat 需要指定 target_id（对话对象的角色 ID）";
    if (!input.free_text || input.free_text.trim().length === 0) return "chat 需要 free_text（你想说的话）";
    const target = ctx.companions.find(c => c.id === input.target_id);
    if (!target) return `target_id="${input.target_id}" 不在你当前所在节点，无法对话`;
    return null;
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    const line = (input.free_text as string) || "……";
    return {
      memory: `我对 ${target?.name ?? targetId} 说："${line}"`,
      event: { category: "social", description: `${ctx.self.name} 对 ${target?.name ?? targetId} 搭话`, intensity: 2 },
      dialogRequest: { targetId, openingLine: line },
    };
  },
  extraParams: {
    target_id: { type: "string", description: "对话目标角色 id。" },
    free_text: { type: "string", description: "开场白或说话内容。" },
  },
  extraRequired: ["target_id", "free_text"],
};

export const sleepAction: ActionDefinition = {
  type: "sleep",
  duration: 8 * TICKS_PER_HOUR,
  triggerHint: "进入作息窗口、该睡觉时使用，完成整段睡眠恢复精力。",
  paramRule: "无需额外参数。仅作息窗口内可用，需在住处。",
  check(ctx) {
    if (!ctx.isSleepHour) return false;
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint() {
    return "⭐ 睡觉（8 小时，intensity >= 3 可打断）";
  },
  validateParams() { return null; },
  execute(ctx, _input) {
    return {
      memory: `我在 ${ctx.here.name} 躺下准备睡觉。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 躺下入睡。`, intensity: 1 },
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "sleep",
          startedAt: ctx.tick,
          endsAt: ctx.tick + (8 * TICKS_PER_HOUR),
          description: `在 ${ctx.here.name} 睡觉`,
          interruptThreshold: 3,
        },
      }],
    };
  },
  onComplete(ctx) {
    const inWindow = ctx.isSleepHour;
    const changes: StateChange[] = [];
    if (inWindow) {
      changes.push({ kind: "resetVital", vital: "fatigue" });
    } else {
      const reduction = Math.round(ctx.self.vitals.fatigue * 0.7);
      changes.push({ kind: "adjustVital", vital: "fatigue", delta: -reduction });
    }
    changes.push({ kind: "adjustStress", delta: -1 });

    return {
      memory: inWindow
        ? "我睡醒了，精神饱满。"
        : "我睡醒了，但不在习惯的睡眠时间，感觉没完全恢复。",
      event: { category: "action", description: `${ctx.self.name} 睡醒了。`, intensity: 2 },
      stateChanges: changes,
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `我被吵醒了——${reason}`,
      event: { category: "action", description: `${ctx.self.name} 被惊醒。`, intensity: 3 },
    };
  },
};

export const moveAction: ActionDefinition = {
  type: "move",
  duration: 0, // engine computes from BFS path length
  triggerHint: "想要移动时使用。",
  paramRule: "必填 target_node_id（目的地 ID，在地图中查找）+ reason（移动原因）。可选 arrival_action。",
  check(_ctx) {
    return true;
  },
  hint(ctx) {
    const entries: Array<{ hint: string; targetNodeId?: string }> = [];
    const fatigueUrgent = ctx.self.vitals.fatigue >= 12;
    const hungerUrgent = ctx.self.vitals.hunger >= 10;
    const hygieneUrgent = ctx.self.vitals.hygiene >= 13;

    if (fatigueUrgent && ctx.facts.restNodeId) {
      entries.push({ hint: "⭐ 回休息处休息", targetNodeId: ctx.facts.restNodeId });
    }
    if (hungerUrgent) {
      for (const n of ctx.reachable) {
        if (n.tags.includes("dining")) {
          entries.push({ hint: `⭐ 去 ${n.name} 用餐`, targetNodeId: n.id });
          break;
        }
      }
    }
    if (hygieneUrgent) {
      for (const n of ctx.reachable) {
        if (n.tags.includes("bathing")) {
          entries.push({ hint: `⭐ 去 ${n.name} 洗浴`, targetNodeId: n.id });
          break;
        }
      }
    }

    entries.push({ hint: "前往地图上任意地点（在 reasoning 中说清楚你为什么要去那里）" });
    return entries;
  },
  validateParams(input, ctx) {
    if (!input.target_node_id) return "move 需要指定 target_node_id（目的地节点 ID）";
    const targetNode = ctx.reachable.find(n => n.id === input.target_node_id);
    if (!targetNode) return `target_node_id="${input.target_node_id}" 不可达或不存在`;
    return null;
  },
  execute(ctx, input) {
    const targetId = input.target_node_id as string;
    const target = ctx.reachable.find((n) => n.id === targetId);
    const reason = (input.reason as string) || "出发前往";
    return {
      memory: `我离开 ${ctx.here.name}，去 ${target?.name ?? targetId}：${reason}。`,
      event: { category: "action", description: `${ctx.self.name} 从 ${ctx.here.name} 前往 ${target?.name ?? targetId}。`, intensity: 1 },
      stateChanges: [{ kind: "setLocation", nodeId: targetId }],
    };
  },
  onComplete(ctx) {
    return {
      memory: `我到达了 ${ctx.here.name}。`,
      event: { category: "action", description: `${ctx.self.name} 到达了 ${ctx.here.name}。`, intensity: 1 },
    };
  },
  extraParams: {
    target_node_id: { type: "string", description: "目的地节点 id。" },
    reason: { type: "string", description: "移动原因（如'去酒馆找田中喝酒'）。" },
    free_text: { type: "string", description: "移动目的或想法（可选）。" },
    arrival_action: {
      type: "object",
      description: "到达目的地后要自动执行的动作。",
      properties: {
        action_type: { type: "string", description: "到达后执行的动作类型。" },
        free_text: { type: "string", description: "动作描述或说话内容。" },
        target_id: { type: "string", description: "交互目标角色 id。" },
        target_node_id: { type: "string", description: "交互目标节点 id。" },
      },
      required: ["action_type"],
    },
  },
  extraRequired: ["target_node_id", "reason"],
};

export const giveAction: ActionDefinition = {
  type: "give",
  displayName: "赠送金钱",
  duration: "instant",
  triggerHint: "身边有人需要帮助，想给予金钱时使用。",
  paramRule: "必填 target_id（给谁）+ amount（金额，正整数）。",
  check(_ctx) {
    return false;
  },
  hint(ctx) {
    return ctx.companions.map((c) => {
      const rel = ctx.self.relations[c.id];
      const relLabel = rel ? rel.kinds.join("/") : "陌生人";
      const imp = ctx.self.impressionBook[c.id];
      const impLabel = imp ? `印象: ${imp.slice(0, 20)}` : "";
      return {
        hint: `give money to ${c.name} (${relLabel}${impLabel ? ", " + impLabel : ""})`,
        targetId: c.id,
      };
    });
  },
  validateParams(input, ctx) {
    if (!input.target_id) return "give 需要指定 target_id（收款人角色 ID）";
    if (!input.amount || input.amount <= 0) return "give 需要 amount（金额，正整数）";
    if (input.amount > ctx.self.money) return `你没有那么多钱（当前 ${ctx.self.money}，尝试给 ${input.amount}）`;
    return null;
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    if (!target) {
      return { memory: "我想给人钱但没找到对方。" };
    }
    const requested = typeof input.amount === "number" ? input.amount : ctx.self.money;
    const actual = Math.min(Math.max(1, Math.floor(requested)), ctx.self.money);
    return {
      memory: `我给了 ${target.name} ${actual} 金钱。`,
      targetMemory: `${ctx.self.name} 给了我 ${actual} 金钱。`,
      event: {
        category: "social",
        description: `${ctx.self.name} 给了 ${target.name} ${actual} 金钱。`,
        intensity: 2,
      },
      stateChanges: [
        { kind: "adjustMoney", amount: -actual, reason: `give to ${target.id}`, targetCharacterId: target.id },
      ],
      dialogRecord: `${ctx.self.name} 给了 ${target.name} ${actual} 金钱。`,
    };
  },
  extraParams: {
    target_id: { type: "string", description: "给予对象角色 id。" },
    amount: { type: "integer", description: "给予金额（默认全部余额）。" },
  },
  extraRequired: ["target_id"],
  usableInDialogue: true,
};

export const travelTogetherAction: ActionDefinition = {
  type: "travel_together",
  displayName: "结伴出行",
  duration: 0, // computed from BFS path length
  usableInDialogue: true,
  triggerHint: "与对话对象约定一同前往某地，边走边聊，途中不会被外界打断。",
  paramRule: "必填 target_node_id（目的地节点 id）或 target_node_name（目的地名称）+ reason（为何前往）。仅对话中可用。",
  check(_ctx) {
    return false; // dialogue-only，正常决策中不可选
  },
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `约 ${c.name} 结伴同行`,
      targetId: c.id,
    }));
  },
  validateParams(input, ctx) {
    const nodeId = input.target_node_id as string | undefined;
    const nodeName = input.target_node_name as string | undefined;
    if (!nodeId && !nodeName) return "travel_together 需要指定 target_node_id（目的地节点 ID）或 target_node_name（目的地名称）";
    if (!input.reason) return "travel_together 需要 reason（结伴前往的原因）";
    let resolvedId: string | undefined;
    if (nodeId) {
      const targetNode = ctx.reachable.find(n => n.id === nodeId);
      if (!targetNode) return `target_node_id="${nodeId}" 不可达或不存在`;
      resolvedId = nodeId;
    } else {
      const match = ctx.reachable.find(n => n.name === nodeName || n.name.includes(nodeName!));
      if (!match) return `找不到名为"${nodeName}"的目的地，请确认地点名称是否正确`;
      resolvedId = match.id;
    }
    if (resolvedId === ctx.here.id) return "你已经在目的地了";
    // Store resolved ID back so execute/dialog don't need to repeat lookup
    (input as Record<string, unknown>).target_node_id = resolvedId;
    return null;
  },
  execute(ctx, input) {
    // 正常不会走这里——对话中 accept 后由 executeDialogueAction 特殊处理
    // 提供 fallback 以保持接口完整性
    const targetId = (input.target_node_id as string)
      || (() => {
        const name = input.target_node_name as string | undefined;
        if (!name) return undefined;
        const m = ctx.reachable.find(n => n.name === name || n.name.includes(name));
        return m?.id;
      })();
    const target = targetId ? ctx.reachable.find(n => n.id === targetId) : undefined;
    const destName = target?.name ?? (input.target_node_name as string) ?? targetId ?? "???";
    const reason = (input.reason as string) || "结伴";
    return {
      memory: `我约了同伴一起去 ${destName}：${reason}。`,
      event: {
        category: "social",
        description: `${ctx.self.name} 约同伴一起去 ${destName}。`,
        intensity: 2,
      },
    };
  },
  extraParams: {
    target_node_id: { type: "string", description: "目的地节点 id（与 target_node_name 二选一）。" },
    target_node_name: { type: "string", description: "目的地名称如'国际通'（与 target_node_id 二选一）。" },
    reason: { type: "string", description: "结伴前往的原因。" },
    free_text: { type: "string", description: "在对话中说明同行细节（可选）。" },
  },
  extraRequired: ["reason"],
};

export const lookAroundAction: ActionDefinition = {
  type: "look_around",
  duration: "instant",
  triggerHint: "无事可做时四处看看。",
  paramRule: "无需额外参数。始终可用，兜底选项。",
  check(_ctx) { return true; },
  hint(ctx) {
    return `环顾四周（查看 ${ctx.here.name} 的情况）`;
  },
  validateParams() { return null; },
  execute(ctx, _input) {
    const lines: string[] = [];
    lines.push(`我环顾四周。我在 ${ctx.here.name}。`);

    const nearby = ctx.companions.slice(0, 5);
    if (nearby.length === 0) {
      lines.push("周围没有其他人。");
    } else {
      const parts = nearby.map((c) => {
        const action = c.currentAction;
        if (action) {
          return `${c.name}（正在${action.description}）`;
        }
        return `${c.name}（站在原地）`;
      });
      lines.push(`周围有：${parts.join("、")}。`);
    }

    const memory = lines.join("");
    return {
      memory,
      event: {
        category: "action",
        description: `${ctx.self.name} 环顾四周，观察周围情况。`,
        intensity: 1,
      },
    };
  },
};

export const buyAction: ActionDefinition = {
  type: "buy",
  duration: "instant",
  triggerHint: "在店铺购买物品（店铺商品无限供应）。",
  paramRule: "必填 item_def_id（物品ID），可选 item_count（默认1）。需在店铺节点。",
  check(ctx) {
    const shop = findShopAtNode(ctx.here.id, ctx.shops);
    if (!shop) return false;
    const prices = shop.goods.map((gid) => ctx.itemDefs.get(gid)?.value ?? Infinity);
    const cheapest = Math.min(...prices);
    return canAfford(ctx.self, cheapest === Infinity ? 0 : cheapest);
  },
  hint(ctx) {
    const shop = findShopAtNode(ctx.here.id, ctx.shops);
    if (!shop) return "（不在此刻店铺）";
    const goods = shop.goods.map((gid) => ctx.itemDefs.get(gid)).filter(Boolean);
    if (goods.length === 0) return "（店铺暂无可购买物品）";
    return goods.map((g) => ({
      hint: `购买 ${g!.name}（$${g!.value}）`,
    }));
  },
  validateParams(input, ctx) {
    const itemDefId = input.item_def_id as string | undefined;
    if (!itemDefId) return "buy 需要 item_def_id";
    const shop = findShopAtNode(ctx.here.id, ctx.shops);
    if (!shop) return "当前位置没有店铺";
    if (!shop.goods.includes(itemDefId)) {
      return `店铺不销售 "${itemDefId}"，可选：${shop.goods.join(", ")}`;
    }
    const itemDef = ctx.itemDefs.get(itemDefId);
    if (!itemDef) return `未知物品 "${itemDefId}"`;
    const count = (input.item_count as number) ?? 1;
    const total = itemDef.value * count;
    if (!canAfford(ctx.self, total)) return `钱不够（需要 ${total}，当前 ${ctx.self.money}）`;
    return null;
  },
  execute(ctx, input) {
    const itemDefId = input.item_def_id as string;
    const count = (input.item_count as number) ?? 1;
    const shop = findShopAtNode(ctx.here.id, ctx.shops)!;
    const itemDef = ctx.itemDefs.get(itemDefId)!;
    const changes = buyItems(ctx.worldId, ctx.tick, ctx.self, shop, itemDef, count);
    return {
      memory: `我购买了 ${itemDef.name} x${count}，花费 ${itemDef.value * count}💰。`,
      event: { category: "action", description: `${ctx.self.name} 购买了 ${itemDef.name}。`, intensity: 1 },
      stateChanges: changes,
    };
  },
  extraParams: {
    item_def_id: { type: "string", description: "要购买的物品 ID。" },
    item_count: { type: "integer", description: "购买数量，默认 1。" },
  },
  extraRequired: ["item_def_id"],
};

export const useItemAction: ActionDefinition = {
  type: "use_item",
  duration: "instant",
  triggerHint: "使用背包中的物品。消耗品使用后消失。",
  paramRule: "必填 item_def_id（从背包中选择）。",
  check(ctx) {
    return ctx.self.inventory.length > 0;
  },
  hint(ctx) {
    const defs = ctx.itemDefs;
    const groups = new Map<string, number>();
    for (const item of ctx.self.inventory) {
      groups.set(item.itemDefId, (groups.get(item.itemDefId) ?? 0) + 1);
    }
    return [...groups.entries()].map(([id, qty]) => {
      const def = defs.get(id);
      return { hint: `使用 ${def?.name ?? id}（持有 ${qty}）` };
    });
  },
  validateParams(input, ctx) {
    const itemDefId = input.item_def_id as string | undefined;
    if (!itemDefId) return "use_item 需要 item_def_id";
    if (!ctx.self.inventory.some((i) => i.itemDefId === itemDefId)) {
      return `你没有 "${itemDefId}"`;
    }
    return null;
  },
  execute(ctx, input) {
    const itemDefId = input.item_def_id as string;
    const itemDef = ctx.itemDefs.get(itemDefId);
    if (!itemDef) return { memory: `我尝试使用未知物品 ${itemDefId}。` };
    const changes: StateChange[] = [];
    if (itemDef.consumable) {
      changes.push({ kind: "removeItem", itemDefId, count: 1 });
    }
    if (itemDef.effects.vitals) {
      const v = itemDef.effects.vitals;
      if (v.hunger) changes.push({ kind: "adjustVital", vital: "hunger", delta: -v.hunger });
      if (v.fatigue) changes.push({ kind: "adjustVital", vital: "fatigue", delta: -v.fatigue });
      if (v.hygiene) changes.push({ kind: "adjustVital", vital: "hygiene", delta: -v.hygiene });
    }
    if (itemDef.effects.emotion) {
      const e = itemDef.effects.emotion;
      if (e.mood) changes.push({ kind: "adjustMood", delta: e.mood });
      if (e.stress) changes.push({ kind: "adjustStress", delta: e.stress });
      if (e.socialSatiety) changes.push({ kind: "adjustSocialSatiety", delta: e.socialSatiety });
    }
    return {
      memory: `我使用了 ${itemDef.name}。`,
      event: { category: "action", description: `${ctx.self.name} 使用了 ${itemDef.name}。`, intensity: 1 },
      stateChanges: changes,
    };
  },
  extraParams: {
    item_def_id: { type: "string", description: "要使用的物品 ID（从背包选择）。" },
  },
  extraRequired: ["item_def_id"],
};

export const giveItemAction: ActionDefinition = {
  type: "give_item",
  displayName: "赠送物品",
  duration: "instant",
  usableInDialogue: true,
  triggerHint: "对话中赠送物品给对方。",
  paramRule: "必填 item_def_id（从背包选择）+ target_id（赠送对象）。仅对话中可用。",
  check(_ctx) { return false; },
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `赠送物品给 ${c.name}`,
      targetId: c.id,
    }));
  },
  validateParams(input, ctx) {
    const itemDefId = input.item_def_id as string | undefined;
    if (!itemDefId) return "give_item 需要 item_def_id";
    if (!ctx.self.inventory.some((i) => i.itemDefId === itemDefId)) {
      return `你没有 "${itemDefId}" 可以赠送`;
    }
    return null;
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    if (!target) return { memory: "赠送失败：找不到对方。" };
    const itemDefId = input.item_def_id as string;
    const itemDef = ctx.itemDefs.get(itemDefId);
    const sysMsg = `${ctx.self.name} 赠送了 ${itemDef?.name ?? itemDefId}（价值 ${itemDef?.value ?? "?"}💰）给 ${target.name}。`;
    return {
      memory: `我赠送了 ${itemDef?.name ?? itemDefId} 给 ${target.name}。`,
      targetMemory: `${ctx.self.name} 赠送了 ${itemDef?.name ?? itemDefId} 给我。`,
      event: { category: "social", description: sysMsg, intensity: 3 },
      stateChanges: [
        { kind: "removeItem", itemDefId, count: 1 },
      ],
      dialogRecord: sysMsg,
    };
  },
  extraParams: {
    target_id: { type: "string", description: "赠送对象角色 id。" },
    item_def_id: { type: "string", description: "要赠送的物品 ID。" },
  },
  extraRequired: ["target_id", "item_def_id"],
};

export const manageEmploymentAction: ActionDefinition = {
  type: "manage_employment",
  displayName: "管理雇佣",
  duration: "instant",
  usableInDialogue: true,
  triggerHint: "店主在对话中可雇佣或解雇对方。",
  paramRule: "必填 target_id + employment_action（hire/fire）。仅店主在对话中可用。",
  check(_ctx) { return false; },
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `雇佣/解雇 ${c.name}`,
      targetId: c.id,
    }));
  },
  validateParams(input, ctx) {
    const action = input.employment_action as string | undefined;
    if (!action || !["hire", "fire"].includes(action)) return "需要 employment_action: hire 或 fire";
    const shop = ctx.shops.find((s) => s.ownerCharacterId === ctx.self.id);
    if (!shop) return "只有店主可以管理雇佣";
    if (action === "hire" && shop.employeeCharacterId) {
      return "店铺已有雇员，需先解雇";
    }
    return null;
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    if (!target) return { memory: "找不到操作对象。" };
    const action = input.employment_action as "hire" | "fire";
    const shop = ctx.shops.find((s) => s.ownerCharacterId === ctx.self.id)!;
    if (action === "hire") {
      const targetEmp = findEmployment(target, ctx.shops);
      if (targetEmp) return { memory: `${target.name} 已有工作。`, targetMemory: `雇佣失败：${target.name} 已有工作。` };
      if (shop.employeeCharacterId) return { memory: `店铺已有雇员。`, targetMemory: `雇佣失败：店铺已有雇员。` };
      return {
        memory: `我雇佣了 ${target.name}。`,
        targetMemory: `${ctx.self.name} 雇佣了你 在 ${ctx.here.name}。`,
        event: { category: "social", description: `${ctx.self.name} 雇佣了 ${target.name}。`, intensity: 3 },
        stateChanges: [{ kind: "setEmployment", shopId: shop.id, characterId: target.id }],
        dialogRecord: `${ctx.self.name} 雇佣了 ${target.name}。`,
      };
    } else {
      if (shop.employeeCharacterId !== target.id) {
        return { memory: `${target.name} 不是店铺雇员。` };
      }
      return {
        memory: `我解雇了 ${target.name}。`,
        targetMemory: `${ctx.self.name} 解雇了你 从 ${ctx.here.name}。`,
        event: { category: "social", description: `${ctx.self.name} 解雇了 ${target.name}。`, intensity: 3 },
        stateChanges: [{ kind: "setEmployment", shopId: shop.id }],
        dialogRecord: `${ctx.self.name} 解雇了 ${target.name}。`,
      };
    }
  },
  extraParams: {
    target_id: { type: "string", description: "雇佣/解雇对象角色 id。" },
    employment_action: { type: "string", description: "hire 或 fire。" },
  },
  extraRequired: ["target_id", "employment_action"],
};

export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction,
  batheAction,
  restAction,
  workAction,
  thinkAction,
  chatAction,
  sleepAction,
  moveAction,
  giveAction,
  travelTogetherAction,
  lookAroundAction,
  buyAction,
  useItemAction,
  giveItemAction,
  manageEmploymentAction,
];
