// Sakuraba Academy custom actions — dialogue-only intimate interactions

const kissAction = {
  type: "kiss",
  duration: "instant",
  triggerHint: "情到深处，想给对方回应或安抚时使用——一个吻胜过千言万语。",
  paramRule: "必填 target_id（亲吻对象）。仅在对话中可用。",
  check(ctx) {
    return false;
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
      memory: `我亲吻了 ${target.name}，心里泛起一阵暖意。`,
      dialogRecord: `${ctx.self.name} 亲吻了 ${target.name}。`,
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 1 },
      ],
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
  triggerHint: "想安抚对方情绪、表达无声的关心时使用——轻柔的触碰比语言更温柔。",
  paramRule: "必填 target_id（抚摸对象）。仅在对话中可用。",
  check(ctx) {
    return false;
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
      memory: `我轻轻抚摸了 ${target.name}，彼此都放松了下来。`,
      dialogRecord: `${ctx.self.name} 抚摸了 ${target.name}。`,
      stateChanges: [
        { kind: "adjustSocialSatiety", delta: 1 },
      ],
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
  triggerHint: "久别重逢、离别之际、或是对方难过时使用——一个拥抱让人感到被在乎。",
  paramRule: "必填 target_id（拥抱对象）。仅在对话中可用。",
  check(ctx) {
    return false;
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
      memory: `我拥抱了 ${target.name}，感到彼此的连接更近了一些。`,
      dialogRecord: `${ctx.self.name} 拥抱了 ${target.name}。`,
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 1 },
      ],
    };
  },
  extraParams: {
    target_id: { type: "string", description: "拥抱对象角色 id。" },
  },
  extraRequired: ["target_id"],
  usableInDialogue: true,
};

module.exports = [kissAction, caressAction, hugAction];
