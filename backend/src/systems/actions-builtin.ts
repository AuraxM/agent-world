import type { ActionDefinition, StateChange } from "../domain/index";
import { TICKS_PER_HOUR } from "../domain/index";
import { DEFAULT_ECONOMY_CONFIG } from "../config/index";
import { getEatCost, getBatheCost } from "./bme";
import { rollWorkIncome } from "./economy";

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
  duration: 5,
  triggerHint: "在工作/学习地点、该干活时使用，赚取收入。",
  paramRule: "可选 free_text。需在个人的活动节点。持续 5 ticks。",
  check(ctx) {
    if (!ctx.facts.activityNodeId) return false;
    if (ctx.self.incomeLevel <= 0) return false;
    if (ctx.self.age < 18) return false;
    return ctx.here.id === ctx.facts.activityNodeId;
  },
  hint(ctx) {
    const prof = ctx.self.profession;
    const label = prof === "student" ? "学习" : prof;
    return `工作（${label}，5 ticks）`;
  },
  validateParams() { return null; },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "专注于手头的事情";
    return {
      memory: `我开始工作：${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 开始工作。`, intensity: 1 },
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "work",
          startedAt: ctx.tick,
          endsAt: ctx.tick + 5,
          description: `在 ${ctx.here.name} 工作`,
          interruptThreshold: 3,
        },
      }],
    };
  },
  onComplete(ctx) {
    const income = rollWorkIncome(ctx.self, DEFAULT_ECONOMY_CONFIG);
    const changes: StateChange[] = [];
    if (income > 0) {
      changes.push({ kind: "adjustMoney", amount: income, reason: "work" });
    }
    return {
      memory: `我完成了工作，收入 ${income}💰。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 完成了工作。`, intensity: 2 },
      stateChanges: changes,
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `我的工作被打断了——${reason}，没有收入。`,
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
  duration: 0, // computed from BFS path length
  usableInDialogue: true,
  triggerHint: "与对话对象约定一同前往某地，边走边聊，途中不会被外界打断。",
  paramRule: "必填 target_node_id（目的地节点 id）+ reason（为何前往）。仅对话中可用。",
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
    if (!input.target_node_id) return "travel_together 需要指定 target_node_id（目的地节点 ID）";
    if (!input.reason) return "travel_together 需要 reason（结伴前往的原因）";
    const targetNode = ctx.reachable.find(n => n.id === input.target_node_id);
    if (!targetNode) return `target_node_id="${input.target_node_id}" 不可达或不存在`;
    if (input.target_node_id === ctx.here.id) return "你已经在目的地了";
    return null;
  },
  execute(ctx, input) {
    // 正常不会走这里——对话中 accept 后由 executeDialogueAction 特殊处理
    // 提供 fallback 以保持接口完整性
    const targetId = input.target_node_id as string;
    const target = ctx.reachable.find(n => n.id === targetId);
    const reason = (input.reason as string) || "结伴";
    return {
      memory: `我约了同伴一起去 ${target?.name ?? targetId}：${reason}。`,
      event: {
        category: "social",
        description: `${ctx.self.name} 约同伴一起去 ${target?.name ?? targetId}。`,
        intensity: 2,
      },
    };
  },
  extraParams: {
    target_node_id: { type: "string", description: "目的地节点 id。" },
    reason: { type: "string", description: "结伴前往的原因。" },
    free_text: { type: "string", description: "在对话中说明同行细节（可选）。" },
  },
  extraRequired: ["target_node_id", "reason"],
};

export const lookAroundAction: ActionDefinition = {
  type: "look_around",
  duration: 5,
  triggerHint: "无事可做时四处看看。",
  paramRule: "无需额外参数。始终可用，兜底选项。",
  check(_ctx) { return true; },
  hint(ctx) {
    return `环顾四周（查看 ${ctx.here.name} 的情况，原地停留 5 ticks）`;
  },
  validateParams() { return null; },
  execute(ctx, _input) {
    const lines: string[] = [];
    lines.push(`我环顾四周。我在 ${ctx.here.name}。`);

    if (ctx.companions.length === 0) {
      lines.push("周围没有其他人。");
    } else {
      const parts = ctx.companions.map((c) => {
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
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "look_around",
          startedAt: ctx.tick,
          endsAt: ctx.tick + 5,
          description: `在 ${ctx.here.name} 观察等待`,
          interruptThreshold: 2,
        },
      }],
    };
  },
  onComplete(ctx) {
    return {
      memory: `我在 ${ctx.here.name} 观察等待结束。`,
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `我观察时被打断了——${reason}`,
    };
  },
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
];
