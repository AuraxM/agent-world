import type { ActionDefinition } from "@/domain/action-system";

export const eatAction: ActionDefinition = {
  type: "eat",
  duration: "instant",
  check(ctx) {
    return ctx.here.tags.includes("dining");
  },
  hint(ctx) {
    const h = ctx.self.vitals.hunger;
    if (h >= 10) return `⭐ 进食（已 ${h} 小时未进食）`;
    if (h >= 5) return "⭐ 进食";
    if (h <= 0) return "进食（不饿，纯消遣）";
    return "进食";
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "吃了一顿饭";
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 2 },
      stateChanges: [{ kind: "resetVital", vital: "hunger" }],
    };
  },
};

export const batheAction: ActionDefinition = {
  type: "bathe",
  duration: "instant",
  check(ctx) {
    return ctx.here.tags.includes("bathing");
  },
  hint(ctx) {
    const h = ctx.self.vitals.hygiene;
    if (h >= 13) return `⭐ 洗浴（已 ${h} 小时未洗浴）`;
    if (h >= 8) return "⭐ 洗浴";
    return "洗浴";
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "洗了个澡";
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 1 },
      stateChanges: [{ kind: "resetVital", vital: "hygiene" }],
    };
  },
};

export const restAction: ActionDefinition = {
  type: "rest",
  duration: "instant",
  check(ctx) {
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint(ctx) {
    return ctx.self.vitals.fatigue >= 12 || ctx.isSleepHour ? "⭐ 休息" : "休息";
  },
  execute(ctx, input) {
    return {
      memory: `我在 ${ctx.here.name} 休息了一会儿。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 休息。`, intensity: 1 },
      stateChanges: [{ kind: "adjustVital", vital: "fatigue", delta: -2 }],
    };
  },
};

export const workAction: ActionDefinition = {
  type: "work",
  duration: "instant",
  check(ctx) {
    if (!ctx.facts.activityNodeId) return false;
    if (ctx.self.profession === "unemployed") return false;
    return ctx.here.id === ctx.facts.activityNodeId;
  },
  hint(ctx) {
    const prof = ctx.self.profession;
    return `工作（${prof === "student" ? "学习" : prof}）`;
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "专注于手头的事情";
    return {
      memory: `我在 ${ctx.here.name} 工作：${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 工作。`, intensity: 1 },
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
};

export const sleepAction: ActionDefinition = {
  type: "sleep",
  duration: 40,
  check(ctx) {
    if (!ctx.isSleepHour) return false;
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint(ctx) {
    return "⭐ 睡觉（8 小时，intensity >= 4 可打断）";
  },
  execute(ctx, input) {
    return {
      memory: `我在 ${ctx.here.name} 躺下准备睡觉。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 躺下入睡。`, intensity: 1 },
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
];
