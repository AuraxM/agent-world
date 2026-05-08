module.exports = [
  // ── hug: 拥抱 ──
  {
    type: "hug",
    duration: "instant",
    triggerHint: "关系亲近的人需要温暖、安慰，或久别重逢时，用拥抱表达关心。",
    paramRule: "必填 target_id（拥抱对象）+ 可选 free_text（抱着时说的话）。",
    usableInDialogue: true,

    check(ctx) {
      return ctx.companions.length > 0;
    },

    hint(ctx) {
      if (ctx.companions.length === 0) return "（身边没有人）";
      const candidates = ctx.companions.filter(c => {
        const rel = ctx.self.relations[c.id];
        return rel && rel.affection >= 0;
      });
      if (candidates.length === 0) return "（身边没有可以拥抱的人）";
      return candidates.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `拥抱 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "hug 需要指定 target_id（拥抱对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法拥抱`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想拥抱对方，但对方不在身边。" };
      const words = input.free_text ? `，说"${input.free_text}"` : "";
      return {
        memory: `我拥抱了 ${target.name}${words}。`,
        targetMemory: `${ctx.self.name} 拥抱了我${words ? `，对我说"${input.free_text}"` : ""}。`,
        event: {
          category: "social",
          description: `${ctx.self.name} 拥抱了 ${target.name}。`,
          intensity: 2,
        },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustStress", delta: -1 },
          { kind: "adjustSocialSatiety", delta: 1 },
        ],
        dialogRecord: `${ctx.self.name} 拥抱了 ${target.name}。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "拥抱对象角色 id。" },
      free_text: { type: "string", description: "拥抱时说的话或想表达的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── comfort: 安慰 ──
  {
    type: "comfort",
    duration: "instant",
    triggerHint: "身边有人情绪低落、压力大或经历了不好的事情时，主动安慰对方。",
    paramRule: "必填 target_id（安慰对象）+ 可选 free_text（安慰的话）。",
    usableInDialogue: true,

    check(ctx) {
      return ctx.companions.length > 0;
    },

    hint(ctx) {
      if (ctx.companions.length === 0) return "（身边没有人）";
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "陌生人";
        return { hint: `安慰 ${c.name} (${label})`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "comfort 需要指定 target_id（安慰对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法安慰`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想安慰对方，但对方不在身边。" };
      const words = input.free_text || "我在你身边";
      return {
        memory: `我安慰了 ${target.name}："${words}"`,
        targetMemory: `${ctx.self.name} 安慰了我："${words}"`,
        event: {
          category: "social",
          description: `${ctx.self.name} 轻声安慰 ${target.name}。`,
          intensity: 2,
        },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustSocialSatiety", delta: 1 },
        ],
        dialogRecord: `${ctx.self.name} 安慰了 ${target.name}："${words}"`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "安慰对象角色 id。" },
      free_text: { type: "string", description: "安慰对方的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── hold_hands: 牵手 ──
  {
    type: "hold_hands",
    duration: "instant",
    triggerHint: "与喜欢的人独处、气氛合适时，牵手表达心意。",
    paramRule: "必填 target_id（牵手对象）+ 可选 free_text（牵手时说的话）。",
    usableInDialogue: true,

    check(ctx) {
      return ctx.companions.length > 0;
    },

    hint(ctx) {
      if (ctx.companions.length === 0) return "（身边没有人）";
      const candidates = ctx.companions.filter(c => {
        const rel = ctx.self.relations[c.id];
        return rel && rel.affection >= 2;
      });
      if (candidates.length === 0) return "（身边没有可以牵手的人）";
      return candidates.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? `好感 ${rel.affection}` : "";
        return { hint: `牵 ${c.name} 的手${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "hold_hands 需要指定 target_id（牵手对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法牵手`;
      const rel = ctx.self.relations[input.target_id];
      if (!rel || rel.affection < 1) return `你和 ${target.name} 的关系还不够亲近，无法牵手`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想牵对方的手，但对方不在身边。" };
      const words = input.free_text ? `，说"${input.free_text}"` : "";
      return {
        memory: `我牵起了 ${target.name} 的手${words}。`,
        targetMemory: `${ctx.self.name} 牵起了我的手${words ? `，对我说"${input.free_text}"` : ""}。`,
        event: {
          category: "social",
          description: `${ctx.self.name} 牵起了 ${target.name} 的手。`,
          intensity: 3,
        },
        stateChanges: [
          { kind: "adjustMood", delta: 2 },
          { kind: "adjustStress", delta: -2 },
          { kind: "adjustSocialSatiety", delta: 2 },
        ],
        dialogRecord: `${ctx.self.name} 牵起了 ${target.name} 的手。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "牵手对象角色 id。" },
      free_text: { type: "string", description: "牵手时说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── pat_head: 摸头 ──
  {
    type: "pat_head",
    duration: "instant",
    triggerHint: "对比自己小的后辈或亲近的人表达亲昵、鼓励时，轻轻摸对方的头。",
    paramRule: "必填 target_id（摸头对象）+ 可选 free_text（摸头时说的话）。",
    usableInDialogue: true,

    check(ctx) {
      return ctx.companions.length > 0;
    },

    hint(ctx) {
      if (ctx.companions.length === 0) return "（身边没有人）";
      const candidates = ctx.companions.filter(c => {
        const rel = ctx.self.relations[c.id];
        const hasGoodRel = rel && rel.affection >= 1;
        const youngerOrSame = c.age <= ctx.self.age;
        return hasGoodRel && youngerOrSame;
      });
      if (candidates.length === 0) return "（身边没有适合摸头的人）";
      return candidates.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `摸 ${c.name} 的头${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "pat_head 需要指定 target_id（摸头对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法摸头`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想摸对方的头，但对方不在身边。" };
      const words = input.free_text ? `，说"${input.free_text}"` : "";
      return {
        memory: `我轻轻摸了摸 ${target.name} 的头${words}。`,
        targetMemory: `${ctx.self.name} 轻轻摸了摸我的头${words ? `，对我说"${input.free_text}"` : ""}。`,
        event: {
          category: "social",
          description: `${ctx.self.name} 摸了摸 ${target.name} 的头。`,
          intensity: 2,
        },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustSocialSatiety", delta: 1 },
        ],
        dialogRecord: `${ctx.self.name} 摸了摸 ${target.name} 的头。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "摸头对象角色 id。" },
      free_text: { type: "string", description: "摸头时说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── encourage: 鼓励 ──
  {
    type: "encourage",
    duration: "instant",
    triggerHint: "身边有人面对挑战或缺乏信心时，用话语给对方打气。",
    paramRule: "必填 target_id（鼓励对象）+ 可选 free_text（鼓励的话）。",
    usableInDialogue: true,

    check(ctx) {
      return ctx.companions.length > 0;
    },

    hint(ctx) {
      if (ctx.companions.length === 0) return "（身边没有人）";
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "陌生人";
        return { hint: `鼓励 ${c.name} (${label})`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "encourage 需要指定 target_id（鼓励对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法鼓励`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想鼓励对方，但对方不在身边。" };
      const words = input.free_text || "加油，你可以的！";
      return {
        memory: `我鼓励 ${target.name}："${words}"`,
        targetMemory: `${ctx.self.name} 鼓励我："${words}"`,
        event: {
          category: "social",
          description: `${ctx.self.name} 给 ${target.name} 打气。`,
          intensity: 2,
        },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustSocialSatiety", delta: 1 },
        ],
        dialogRecord: `${ctx.self.name} 鼓励 ${target.name}："${words}"`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "鼓励对象角色 id。" },
      free_text: { type: "string", description: "鼓励对方的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },
];
