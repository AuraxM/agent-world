import type { ActionDefinition, StateChange } from "@/domain/action-system";
import { TICKS_PER_HOUR } from "@/domain/enums";
import { DEFAULT_ECONOMY_CONFIG } from "@/config/types";
import { rollWorkIncome } from "./economy";

export const eatAction: ActionDefinition = {
  type: "eat",
  duration: "instant",
  check(ctx) {
    if (!ctx.here.tags.includes("dining")) return false;
    if (ctx.self.expenseExempt) return true;
    return ctx.self.money >= DEFAULT_ECONOMY_CONFIG.survivalCosts.eat;
  },
  hint(ctx) {
    const h = ctx.self.vitals.hunger;
    const costNote = ctx.self.expenseExempt
      ? ""
      : ` (-${DEFAULT_ECONOMY_CONFIG.survivalCosts.eat}💰)`;
    if (h >= 10) return `⭐ 进食（已 ${h} 小时未进食）${costNote}`;
    if (h >= 5) return `⭐ 进食${costNote}`;
    if (h <= 0) return `进食（不饿，纯消遣）${costNote}`;
    return `进食${costNote}`;
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "吃了一顿饭";
    const changes: StateChange[] = [{ kind: "resetVital", vital: "hunger" }];
    if (!ctx.self.expenseExempt) {
      changes.push({
        kind: "adjustMoney",
        amount: -DEFAULT_ECONOMY_CONFIG.survivalCosts.eat,
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
  check(ctx) {
    if (!ctx.here.tags.includes("bathing")) return false;
    if (ctx.self.expenseExempt) return true;
    return ctx.self.money >= DEFAULT_ECONOMY_CONFIG.survivalCosts.bathe;
  },
  hint(ctx) {
    const h = ctx.self.vitals.hygiene;
    const costNote = ctx.self.expenseExempt
      ? ""
      : ` (-${DEFAULT_ECONOMY_CONFIG.survivalCosts.bathe}💰)`;
    if (h >= 13) return `⭐ 洗浴（已 ${h} 小时未洗浴）${costNote}`;
    if (h >= 8) return `⭐ 洗浴${costNote}`;
    return `洗浴${costNote}`;
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "洗了个澡";
    const changes: StateChange[] = [{ kind: "resetVital", vital: "hygiene" }];
    if (!ctx.self.expenseExempt) {
      changes.push({
        kind: "adjustMoney",
        amount: -DEFAULT_ECONOMY_CONFIG.survivalCosts.bathe,
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
  check(ctx) {
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint(ctx) {
    return ctx.self.vitals.fatigue >= 12 || ctx.isSleepHour ? "⭐ 休息 (5 ticks)" : "休息 (5 ticks)";
  },
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
          interruptThreshold: 3,
        },
      }],
    };
  },
  onComplete(ctx) {
    return {
      memory: `我在 ${ctx.here.name} 休息好了。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 休息完毕。`, intensity: 1 },
      stateChanges: [{ kind: "adjustVital", vital: "fatigue", delta: -2 }],
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
  check(ctx) {
    if (!ctx.facts.activityNodeId) return false;
    if (ctx.self.incomeLevel <= 0) return false;
    if (ctx.self.age < 18) return false;
    return ctx.here.id === ctx.facts.activityNodeId;
  },
  hint(ctx) {
    const prof = ctx.self.profession;
    const label = prof === "student" ? "学习" : prof;
    return `工作（${label}，10 ticks）`;
  },
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
          endsAt: ctx.tick + 10,
          description: `在 ${ctx.here.name} 工作`,
          interruptThreshold: 3,
        },
      }],
    };
  },
  onComplete(ctx) {
    const multiplier = 1.0;
    const income = rollWorkIncome(ctx.self.incomeLevel, DEFAULT_ECONOMY_CONFIG, multiplier);
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
  execute(ctx, input) {
    const thought = (input.free_text as string) || "默然思索";
    return {
      memory: `我沉思：${thought}`,
      event: { category: "inner", description: `${ctx.self.name} 在 ${ctx.here.name} 若有所思。`, intensity: 1 },
    };
  },
};

export const speakAction: ActionDefinition = {
  type: "speak",
  duration: "instant",
  check(ctx) {
    return ctx.companions.length > 0;
  },
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `和 ${c.name} 交谈`,
      targetId: c.id,
    }));
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
  check(ctx) {
    if (!ctx.isSleepHour) return false;
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint(ctx) {
    return "⭐ 睡觉（8 小时，intensity >= 4 可打断）";
  },
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
          interruptThreshold: 4,
        },
      }],
    };
  },
  onComplete(ctx) {
    return {
      memory: "我睡醒了，精神饱满。",
      event: { category: "action", description: `${ctx.self.name} 睡醒了。`, intensity: 2 },
      stateChanges: [{ kind: "resetVital", vital: "fatigue" }],
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
  check(_ctx) {
    return true;
  },
  hint(ctx) {
    const entries: Array<{ hint: string; targetNodeId?: string }> = [];
    const highlighted = new Set<string>();
    if (ctx.facts.restNodeId) highlighted.add(ctx.facts.restNodeId);
    for (const n of ctx.reachable) {
      if (n.tags.includes("dining") || n.tags.includes("bathing")) highlighted.add(n.id);
    }
    for (const nId of highlighted) {
      const n = ctx.reachable.find((r) => r.id === nId);
      if (!n) continue;
      const isRest = ctx.facts.restNodeId !== null && n.id === ctx.facts.restNodeId;
      let hint = `前往 ${n.name}`;
      if (isRest && (ctx.self.vitals.fatigue >= 12 || ctx.isSleepHour)) {
        hint = `⭐ ${hint}——休息处`;
      } else if (n.tags.includes("dining") && ctx.self.vitals.hunger >= 5) {
        hint = `⭐ ${hint}——可用餐`;
      } else if (n.tags.includes("bathing") && ctx.self.vitals.hygiene >= 8) {
        hint = `⭐ ${hint}——可洗浴`;
      }
      entries.push({ hint, targetNodeId: n.id });
    }
    entries.push({ hint: "前往地图上任意地点（指定 target_node_id + reason）。" });
    return entries;
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

export const waitAction: ActionDefinition = {
  type: "wait",
  duration: 5,
  check(_ctx) {
    return true;
  },
  hint(ctx) {
    const hour = Math.floor(ctx.tick / TICKS_PER_HOUR) % 24;
    return `等待（当前 world time ${hour}:00，原地停留 5 ticks）`;
  },
  execute(ctx, _input) {
    return {
      memory: `我在 ${ctx.here.name} 开始等待。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 驻足等待。`, intensity: 1 },
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "wait",
          startedAt: ctx.tick,
          endsAt: ctx.tick + 5,
          description: `在 ${ctx.here.name} 等待`,
          interruptThreshold: 2,
        },
      }],
    };
  },
  onComplete(ctx) {
    return {
      memory: `我在 ${ctx.here.name} 等待结束。`,
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `我等待时被打断了——${reason}`,
    };
  },
};

export const giveAction: ActionDefinition = {
  type: "give",
  duration: "instant",
  check(ctx) {
    if (ctx.self.money <= 0) return false;
    if (ctx.companions.length === 0) return false;
    // Check shortMemory for recent beg/help requests
    const hasRequest = ctx.self.shortMemory.some(
      (m) =>
        m.content.includes("缺钱") ||
        m.content.includes("借钱") ||
        m.content.includes("求助") ||
        m.content.includes("给点钱") ||
        m.content.includes("帮帮忙") ||
        m.content.includes("经济困难"),
    );
    return hasRequest;
  },
  hint(ctx) {
    return ctx.companions.map((c) => {
      const rel = ctx.self.relations[c.id];
      const relLabel = rel ? rel.kinds.join("/") : "陌生人";
      const affLabel = rel
        ? `感情: ${rel.affection > 0 ? "+" : ""}${rel.affection}`
        : "";
      return {
        hint: `give money to ${c.name} (${relLabel}, ${affLabel})`,
        targetId: c.id,
      };
    });
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
      event: {
        category: "social",
        description: `${ctx.self.name} 给了 ${target.name} 一些钱。`,
        intensity: 2,
      },
      stateChanges: [
        { kind: "adjustMoney", amount: -actual, reason: `give to ${target.id}` },
      ],
    };
  },
  extraParams: {
    target_id: { type: "string", description: "给予对象角色 id。" },
    amount: { type: "integer", description: "给予金额（默认全部余额）。" },
  },
  extraRequired: ["target_id"],
};

export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction,
  batheAction,
  restAction,
  workAction,
  thinkAction,
  speakAction,
  sleepAction,
  moveAction,
  waitAction,
  giveAction,
];
