module.exports = [
  // ── hug: 拥抱 ──
  {
    type: "hug",
    duration: "instant",
    triggerHint: "关系亲近的人需要温暖、安慰，或久别重逢时，用拥抱表达关心。",
    paramRule: "必填 target_id（拥抱对象）+ 可选 free_text（抱着时说的话）。",
    usableInDialogue: true,

    check(ctx) {
      return true;
    },

    hint(ctx) {
      return ctx.companions.map(c => {
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

  // ── kiss: 亲吻 ──
  {
    type: "kiss",
    duration: "instant",
    triggerHint: "与亲密的人独处、气氛浪漫时，用一个吻表达爱意。",
    paramRule: "必填 target_id（亲吻对象）+ 可选 free_text（亲吻后说的话）。",
    usableInDialogue: true,

    check(ctx) {
      return true;
    },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `亲吻 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "kiss 需要指定 target_id（亲吻对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法亲吻`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想亲吻对方，但对方不在身边。" };
      const words = input.free_text ? `，然后说"${input.free_text}"` : "";
      return {
        memory: `我吻了 ${target.name}${words}。`,
        targetMemory: `${ctx.self.name} 吻了我${words ? `，然后对我说"${input.free_text}"` : ""}。`,
        event: {
          category: "social",
          description: `${ctx.self.name} 吻了 ${target.name}。`,
          intensity: 4,
          scope: "node",
        },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
        ],
        dialogRecord: `${ctx.self.name} 吻了 ${target.name}。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "亲吻对象角色 id。" },
      free_text: { type: "string", description: "亲吻后说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── sex: 做爱 ──
  {
    type: "sex",
    duration: "instant",
    triggerHint: "与喜欢的人在私密空间独处、情欲高涨时，与对方做爱——褪去衣物，肌肤相亲，在喘息和汗水里交缠。",
    paramRule: "必填 target_id（做爱对象）+ 可选 free_text（过程中或事后想说的话）。",
    usableInDialogue: true,

    check(ctx) {
      return true;
    },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `与 ${c.name} 做爱${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "sex 需要指定 target_id（做爱对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想和对方做爱，但对方不在身边。" };
      const words = input.free_text ? `，事后我对ta说"${input.free_text}"` : "";
      return {
        memory: `我和 ${target.name} 做爱了。我们褪去衣物，肌肤紧贴，在喘息中感受彼此的体温和欲望${words}。`,
        targetMemory: `${ctx.self.name} 和我做爱了。我们褪去衣物，肌肤相亲，在喘息和汗水里交缠${words ? `，事后ta对我说"${input.free_text}"` : ""}。`,
        event: {
          category: "social",
          description: `${ctx.self.name} 和 ${target.name} 在私密空间里做爱，肌肤相亲。`,
          intensity: 4,
          scope: "private",
        },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
          { kind: "adjustVital", vital: "fatigue", delta: 2 },
        ],
        dialogRecord: `${ctx.self.name} 与 ${target.name} 做爱，肌肤相亲。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "做爱对象角色 id。" },
      free_text: { type: "string", description: "做爱过程中或事后想说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },
];
