module.exports = [
  // ── hold_hands: 牵手 ──
  {
    type: "hold_hands",
    displayName: "牵手",
    duration: "instant",
    triggerHint: "与有好感的人并肩行走时，用牵手传递温度与试探。",
    paramRule: "必填 target_id（牵手对象）+ 可选 free_text（牵手时想说的话）。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `牵手 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "hold_hands 需要指定 target_id（牵手对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法牵手`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想牵对方的手，但对方不在身边。" };
      const words = input.free_text ? `，对ta说"${input.free_text}"` : "";
      return {
        memory: `我牵起 ${target.name} 的手，指尖穿过ta的指缝，掌心贴在一起。ta的手比我想象中更暖，微微颤了一下，没有抽开。${words}`,
        targetMemory: `${ctx.self.name} 牵起我的手，十指交扣。ta的掌心干燥而温热，拇指轻轻摩挲着我的手背。${input.free_text ? ` ta对我说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 牵起了 ${target.name} 的手。`, intensity: 2, scope: "node" },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustStress", delta: -1 },
          { kind: "adjustSocialSatiety", delta: 1 },
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
    displayName: "摸头",
    duration: "instant",
    triggerHint: "想宠溺对方、或借身高差调戏时，揉乱ta的头发。",
    paramRule: "必填 target_id（摸头对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `摸头 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
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
      if (!target) return { memory: "我想揉对方的头发，但对方不在身边。" };
      const words = input.free_text ? `，对ta说"${input.free_text}"` : "";
      return {
        memory: `我把手放在 ${target.name} 的头顶，轻轻揉了揉。ta的头发比看起来更软，穿过我的指缝。ta抬头看我，那个表情让我胸口一紧。${words}`,
        targetMemory: `${ctx.self.name} 揉了我的头发。动作很轻，但手掌的重量让人安心又被当成小孩的微妙不甘。${input.free_text ? ` ta对我说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 揉了揉 ${target.name} 的头发。`, intensity: 2, scope: "node" },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustStress", delta: -1 },
          { kind: "adjustSocialSatiety", delta: 1 },
        ],
        dialogRecord: `${ctx.self.name} 揉了揉 ${target.name} 的头发。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "摸头对象角色 id。" },
      free_text: { type: "string", description: "摸头时说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── caress: 抚摸 ──
  {
    type: "caress",
    displayName: "抚摸",
    duration: "instant",
    triggerHint: "独处、气氛暧昧、体温升高时，手掌在对方身体上游走，从肩膀到腰线，隔着制服感受肌肤的弧度与热度。",
    paramRule: "必填 target_id（抚摸对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `抚摸 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "caress 需要指定 target_id（抚摸对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法抚摸`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想抚摸对方，但对方不在身边。" };
      const words = input.free_text ? `我在ta耳边低声说："${input.free_text}"` : "";
      return {
        memory: `我抚摸着 ${target.name}。手掌从ta的肩膀滑下，经过背脊的凹陷，停在腰侧。隔着一层薄薄的衬衫，我能感觉到ta体温在升高，肌肉在我指尖下微微绷紧又放松。呼吸声变重了。${words}`,
        targetMemory: `${ctx.self.name} 的手在我身上游走。从肩膀到腰，缓慢而用力。我想说停下，但身体没有躲——那种被需要的感觉烧穿了理智。${input.free_text ? ` ta在我耳边说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 抚摸着 ${target.name}。`, intensity: 3, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 2 },
          { kind: "adjustStress", delta: -2 },
          { kind: "adjustSocialSatiety", delta: 2 },
        ],
        dialogRecord: `${ctx.self.name} 的手在 ${target.name} 身上游走，从肩膀滑到腰侧。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "抚摸对象角色 id。" },
      free_text: { type: "string", description: "抚摸时说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── unbutton: 解开纽扣 ──
  {
    type: "unbutton",
    displayName: "解开纽扣",
    duration: "instant",
    triggerHint: "私密空间中情欲高涨，指尖一颗颗挑开对方衣扣，露出锁骨与胸口。",
    paramRule: "必填 target_id（对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `解开 ${c.name} 的纽扣${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "unbutton 需要指定 target_id（对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想解开对方的扣子，但对方不在身边。" };
      const words = input.free_text ? `我在ta耳边说："${input.free_text}"` : "";
      return {
        memory: `我解开 ${target.name} 的纽扣。第一颗，锁骨露出来。第二颗，胸口起伏的曲线清晰可见。我的手指碰到ta的皮肤，烫得惊人。ta没有推开我，只是咬着嘴唇，呼吸急促。我把手掌贴上ta裸露的胸口，感受心跳的节奏撞进掌心。${words}`,
        targetMemory: `${ctx.self.name} 解开了我的扣子。ta的手指很慢，每解开一颗就停顿一秒，像在等我拒绝——但我没有。ta的指尖碰到我的胸口时，我全身都绷紧了。${input.free_text ? ` ta说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 解开了 ${target.name} 的纽扣。`, intensity: 4, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
        ],
        dialogRecord: `${ctx.self.name} 一颗颗解开了 ${target.name} 的扣子，指尖碰到ta的胸口。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "对象角色 id。" },
      free_text: { type: "string", description: "解开纽扣时或之后想说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── lick_ear: 舔耳 ──
  {
    type: "lick_ear",
    displayName: "舔耳",
    duration: "instant",
    triggerHint: "极亲密时的挑逗——凑近耳边，舌尖沿着耳廓描摹，探入耳道，听对方压抑的喘息。",
    paramRule: "必填 target_id（舔耳对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `舔舐 ${c.name} 的耳朵${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "lick_ear 需要指定 target_id（舔耳对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想舔对方的耳朵，但对方不在身边。" };
      const words = input.free_text ? `我退开后说："${input.free_text}"` : "";
      return {
        memory: `我凑近 ${target.name} 的耳边，舌尖轻轻舔过ta的耳廓，从耳垂到耳尖，然后探进去。ta的身体猛地颤了一下，发出一声没压住的喘息。我感觉到ta的手指攥紧了我的衣角，指甲隔着一层布料嵌进掌心。${words}`,
        targetMemory: `${ctx.self.name} 舔了我的耳朵。温热湿润的触感从耳垂蔓延到耳道深处，酥麻像电流一样窜下脊椎。我攥紧了拳头，没忍住那声喘息。${input.free_text ? ` ta退开后说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 舔了 ${target.name} 的耳朵。`, intensity: 4, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
        ],
        dialogRecord: `${ctx.self.name} 凑近 ${target.name} 耳边，舌尖描过ta的耳廓。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "舔耳对象角色 id。" },
      free_text: { type: "string", description: "舔耳后想说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── kiss: 亲吻（覆盖内置） ──
  {
    type: "kiss",
    displayName: "亲吻",
    duration: "instant",
    triggerHint: "与喜欢的人独处，气氛到了无言的临界点——嘴唇压过去，舌头顶开齿关，在彼此的口腔里纠缠。",
    paramRule: "必填 target_id（亲吻对象）+ 可选 free_text（亲吻后说的话）。",
    usableInDialogue: true,

    check(ctx) { return true; },

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
      const words = input.free_text ? `，然后对ta说"${input.free_text}"` : "";
      return {
        memory: `我吻了 ${target.name}。嘴唇压上去的时候ta没有躲，我扣住ta的后颈，加深这个吻。舌头探进ta的口腔，尝到一丝甜味。ta的呼吸打在我脸上，急促又湿热。分开的时候，一条银丝还连在唇间。${words}`,
        targetMemory: `${ctx.self.name} 吻了我。不是试探的轻碰，是直接压上来的深吻。ta的舌头热得烫人，我想抵抗但身体先投降了。脑子里一片空白，只剩下嘴唇和舌尖的触感。${input.free_text ? ` 然后ta说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 吻了 ${target.name}。`, intensity: 4, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
        ],
        dialogRecord: `${ctx.self.name} 吻了 ${target.name}，舌头探进ta的口腔。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "亲吻对象角色 id。" },
      free_text: { type: "string", description: "亲吻后说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },
];
