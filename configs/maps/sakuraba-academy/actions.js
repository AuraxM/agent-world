// Sakuraba Academy custom actions — dialogue-only intimate interactions

const kissAction = {
  type: "kiss",
  duration: "instant",
  check(ctx) {
    return ctx.companions.length > 0;
  },
  hint(ctx) {
    const target = ctx.companions[0];
    return target ? `亲吻 ${target.name}` : "亲吻对方";
  },
  execute(ctx, input) {
    const targetId = input.target_id;
    const target = ctx.companions.find(function (c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想亲吻对方但没找到人。" };
    }
    return {
      memory: `我亲吻了 ${target.name}。`,
      dialogRecord: `${ctx.self.name} 亲吻了 ${target.name}。`,
    };
  },
  extraParams: {
    target_id: { type: "string", description: "亲吻对象角色 id。" },
  },
  extraRequired: ["target_id"],
  usableInDialogue: true,
};

const caressAction = {
  type: "caress",
  duration: "instant",
  check(ctx) {
    return ctx.companions.length > 0;
  },
  hint(ctx) {
    const target = ctx.companions[0];
    return target ? `抚摸 ${target.name}` : "抚摸对方";
  },
  execute(ctx, input) {
    const targetId = input.target_id;
    const target = ctx.companions.find(function (c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想抚摸对方但没找到人。" };
    }
    return {
      memory: `我抚摸了 ${target.name}。`,
      dialogRecord: `${ctx.self.name} 抚摸了 ${target.name}。`,
    };
  },
  extraParams: {
    target_id: { type: "string", description: "抚摸对象角色 id。" },
  },
  extraRequired: ["target_id"],
  usableInDialogue: true,
};

const hugAction = {
  type: "hug",
  duration: "instant",
  check(ctx) {
    return ctx.companions.length > 0;
  },
  hint(ctx) {
    const target = ctx.companions[0];
    return target ? `拥抱 ${target.name}` : "拥抱对方";
  },
  execute(ctx, input) {
    const targetId = input.target_id;
    const target = ctx.companions.find(function (c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想拥抱对方但没找到人。" };
    }
    return {
      memory: `我拥抱了 ${target.name}。`,
      dialogRecord: `${ctx.self.name} 拥抱了 ${target.name}。`,
    };
  },
  extraParams: {
    target_id: { type: "string", description: "拥抱对象角色 id。" },
  },
  extraRequired: ["target_id"],
  usableInDialogue: true,
};

module.exports = [kissAction, caressAction, hugAction];
