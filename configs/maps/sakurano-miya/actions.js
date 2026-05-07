// Sakurano-Miya custom actions (9 new + 3 from sakuraba-academy)

// ============================================================
// 保留自 sakuraba-academy (kiss, caress, hug)
// ============================================================

var kissAction = {
  type: "kiss",
  duration: "instant",
  triggerHint: "亲吻可以用来表达爱意。",
  paramRule: "必填 target_id（亲吻对象）。仅在对话中可用。",
  check: function(ctx) { return false; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "亲吻 " + target.name : "亲吻对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想亲吻对方但没找到人。" };
    }
    return {
      memory: "我亲吻了 " + target.name + "，心里泛起一阵暖意。",
      dialogRecord: ctx.self.name + " 亲吻了 " + target.name + "。",
      targetMemory: ctx.self.name + " 亲吻了我。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "亲吻对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var caressAction = {
  type: "caress",
  duration: "instant",
  triggerHint: "抚摸可以安抚对方，增进感情。",
  paramRule: "必填 target_id（抚摸对象）。仅在对话中可用。",
  check: function(ctx) { return false; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "抚摸 " + target.name : "抚摸对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想抚摸对方但没找到人。" };
    }
    return {
      memory: "我轻轻抚摸了 " + target.name + "，彼此都放松了下来。",
      dialogRecord: ctx.self.name + " 抚摸了 " + target.name + "。",
      targetMemory: ctx.self.name + " 轻轻抚摸了我。",
      stateChanges: [
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "抚摸对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var hugAction = {
  type: "hug",
  duration: "instant",
  triggerHint: "拥抱可以缓解压力，增进感情。",
  paramRule: "必填 target_id（拥抱对象）。仅在对话中可用。",
  check: function(ctx) { return false; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "拥抱 " + target.name : "拥抱对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想拥抱对方但没找到人。" };
    }
    return {
      memory: "我拥抱了 " + target.name + "，感到彼此的连接更近了一些。",
      dialogRecord: ctx.self.name + " 拥抱了 " + target.name + "。",
      targetMemory: ctx.self.name + " 拥抱了我。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "拥抱对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

// ============================================================
// 新增恋爱互动 (7)
// ============================================================

var confessAction = {
  type: "confess",
  duration: "instant",
  triggerHint: "在想要向对方表明心意的关键时刻使用。选择安静而特别的场所——天台、河边樱花道、神社、展望台。",
  paramRule: "必填 target_id（告白对象）+ free_text（告白的话语）。需在 quiet 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("quiet") !== -1;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "向 " + target.name + " 告白" : "告白";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我鼓起了勇气但对方不在身边。" };
    }
    return {
      memory: "我在" + ctx.here.name + "向 " + target.name + " 告白了。说出了：" + (input.free_text || "我喜欢你") + " ——这是我人生中最紧张也最释然的时刻。",
      dialogRecord: ctx.self.name + " 在" + ctx.here.name + "向 " + target.name + " 告白了。",
      targetMemory: ctx.self.name + " 在" + ctx.here.name + "向我告白了，他/她说：" + (input.free_text || "我喜欢你") + "。",
      stateChanges: [
        { kind: "adjustMood", delta: 2 },
        { kind: "adjustStress", delta: -2 },
        { kind: "adjustSocialSatiety", delta: 2 }
      ]
    };
  },
  extraParams: {
    target_id: { type: "string", description: "告白对象角色 id。" },
    free_text: { type: "string", description: "告白的话语。" }
  },
  extraRequired: ["target_id", "free_text"],
  usableInDialogue: true
};

var holdHandsAction = {
  type: "hold_hands",
  duration: "instant",
  triggerHint: "在并肩漫步或安静相处时，想迈出关系的第一步时使用。",
  paramRule: "必填 target_id（牵手对象）。需在 outdoor 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("outdoor") !== -1;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "牵 " + target.name + " 的手" : "牵手";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想牵对方的手但没找到人。" };
    }
    return {
      memory: "我牵起了 " + target.name + " 的手。手心微微出汗——不知道谁先紧张的。",
      dialogRecord: ctx.self.name + " 牵起了 " + target.name + " 的手。",
      targetMemory: ctx.self.name + " 牵起了我的手。我能感觉到他/她的手心温度。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "牵手对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var giveGiftAction = {
  type: "give_gift",
  duration: "instant",
  triggerHint: "在想要用物品表达心意时使用——生日、节日、或者只是想让对方知道你在想他/她。",
  paramRule: "必填 target_id（受礼者）+ free_text（礼物是什么）。",
  check: function(ctx) { return true; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "送礼物给 " + target.name : "送礼物";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想送礼物但对方不在身边。" };
    }
    return {
      memory: "我把" + (input.free_text || "礼物") + "送给了 " + target.name + "。他/她收到时笑了。",
      dialogRecord: ctx.self.name + " 送给了 " + target.name + " " + (input.free_text || "一份礼物") + "。",
      targetMemory: ctx.self.name + " 送给了我" + (input.free_text || "一份礼物") + "。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 2 }
      ]
    };
  },
  extraParams: {
    target_id: { type: "string", description: "受礼者角色 id。" },
    free_text: { type: "string", description: "礼物是什么。" }
  },
  extraRequired: ["target_id", "free_text"],
  usableInDialogue: true
};

var inviteAction = {
  type: "invite",
  duration: 1,
  triggerHint: "想约对方一起去某个地方时使用——咖啡店、河边、祭典、一起回家。",
  paramRule: "必填 target_id（邀请对象）+ target_node_id（目的地）。",
  check: function(ctx) { return true; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    if (!target) return null;
    return [
      { hint: "邀 " + target.name + " 去咖啡店", targetId: target.id, targetNodeId: "node-haru-no-ne" },
      { hint: "邀 " + target.name + " 去河边散步", targetId: target.id, targetNodeId: "node-riverside-path" },
      { hint: "邀 " + target.name + " 去神社", targetId: target.id, targetNodeId: "node-shrine" }
    ];
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想邀请对方但没找到人。" };
    }
    var targetNodeId = input.target_node_id;
    var reachable = ctx.reachable || [];
    var destination = reachable.find(function(n) { return n.id === targetNodeId; });
    var placeName = destination ? destination.name : (targetNodeId || "那个地方");
    return {
      memory: "我邀请了 " + target.name + " 一起去" + placeName + "。",
      dialogRecord: ctx.self.name + " 邀请了 " + target.name + " 一起去" + placeName + "。",
      targetMemory: ctx.self.name + " 邀请我一起去" + placeName + "。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: {
    target_id: { type: "string", description: "邀请对象角色 id。" },
    target_node_id: { type: "string", description: "目的地节点 id。" }
  },
  extraRequired: ["target_id", "target_node_id"],
  usableInDialogue: true
};

var writeLetterAction = {
  type: "write_letter",
  duration: 1,
  triggerHint: "在想要将无法当面说出的话写成文字时使用。适合内向或在远距离时表达心意。",
  paramRule: "必填 free_text（信的内容）。需在 quiet 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("quiet") !== -1;
  },
  hint: function(ctx) { return "写情书"; },
  execute: function(ctx, input) {
    return {
      memory: "我在" + ctx.here.name + "写了一封信。信里写着：" + (input.free_text || "我喜欢你") + " ——这些写在纸上的话，也许有一天会送到那个人手里。",
      stateChanges: [
        { kind: "adjustStress", delta: -1 }
      ]
    };
  },
  extraParams: { free_text: { type: "string", description: "信的内容。" } },
  extraRequired: ["free_text"],
  usableInDialogue: false
};

var comfortAction = {
  type: "comfort",
  duration: "instant",
  triggerHint: "在对方情绪低落或压力大的时候使用。有时候一个安静的陪伴比千言万语更有用。",
  paramRule: "必填 target_id（安慰对象）。需对方 stress ≥ 2 或 mood ≤ -1。",
  check: function(ctx) {
    var target = ctx.companions.find(function(c) {
      return (c.emotion && c.emotion.stress >= 2) || (c.emotion && c.emotion.mood <= -1);
    });
    return !!target;
  },
  hint: function(ctx) {
    var target = ctx.companions.find(function(c) {
      return (c.emotion && c.emotion.stress >= 2) || (c.emotion && c.emotion.mood <= -1);
    });
    return target ? "安慰 " + target.name : "安慰对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想安慰对方但没找到人。" };
    }
    return {
      memory: "我安慰了 " + target.name + "。有时候不需要说什么——陪在旁边就够了。",
      dialogRecord: ctx.self.name + " 安慰了 " + target.name + "。",
      targetMemory: ctx.self.name + " 在我低落时安慰了我。只是简简单单地陪着我——但那就是我需要的一切。",
      stateChanges: [
        { kind: "adjustStress", delta: -2 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "安慰对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var teaseAction = {
  type: "tease",
  duration: "instant",
  triggerHint: "在和亲近的人开玩笑、逗对方时使用。适合青梅竹马、好友、以及——偷偷喜欢但不想被发现的人。",
  paramRule: "必填 target_id（捉弄对象）。需与对方 affection ≥ 1 或有 friend/classmate 关系。",
  check: function(ctx) {
    var target = ctx.companions[0];
    if (!target) return false;
    var rel = ctx.self.relations && ctx.self.relations[target.id];
    if (!rel) return false;
    var hasAffection = rel.affection >= 1;
    var hasKinds = rel.kinds && rel.kinds.some(function(k) {
      return k === "friend" || k === "classmate" || k === "neighbor";
    });
    return hasAffection || hasKinds;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "捉弄 " + target.name : "捉弄对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想捉弄对方但没找到人。" };
    }
    var moodDelta = Math.random() < 0.7 ? 1 : -1;
    return {
      memory: "我捉弄了 " + target.name + " 一下。他/她" + (moodDelta > 0 ? "笑了——那是我最喜欢的表情。" : "好像有点生气——糟糕。"),
      dialogRecord: ctx.self.name + " 捉弄了 " + target.name + "。",
      targetMemory: ctx.self.name + " 捉弄了我。" + (moodDelta > 0 ? "虽然被捉弄了但挺开心的。" : "有点不爽——但也没真的生气。"),
      stateChanges: [
        { kind: "adjustMood", delta: moodDelta },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "捉弄对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

// ============================================================
// 校园特有 (2)
// ============================================================

var studyTogetherAction = {
  type: "study_together",
  duration: 3,
  triggerHint: "在想要和对方一起备考或学习时使用。图书馆或教室的安静时光——最适合关系的自然升温。",
  paramRule: "必填 target_id（学习同伴）。需在 education 或 quiet 标签节点。",
  check: function(ctx) {
    var hasEdu = ctx.here.tags.indexOf("education") !== -1;
    var hasQuiet = ctx.here.tags.indexOf("quiet") !== -1;
    return hasEdu || hasQuiet;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "和 " + target.name + " 一起学习" : "一起学习";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想找对方一起学习但没找到人。" };
    }
    return {
      memory: "我和 " + target.name + " 在" + ctx.here.name + "一起学习了三个小时。中间休息了两次——一次是讨论题目，一次是只是看着窗外发呆。",
      dialogRecord: ctx.self.name + " 和 " + target.name + " 在" + ctx.here.name + "一起学习。",
      targetMemory: ctx.self.name + " 和我一起在" + ctx.here.name + "学习。他/她教我那道题的时候离得很近。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "学习同伴角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: false
};

var walkHomeAction = {
  type: "walk_home",
  duration: 2,
  triggerHint: "放学后邀请对方一起走过樱花道回家。最日常的互动——也最容易在不知不觉中拉近距离。",
  paramRule: "必填 target_id（同行者）。需在 outdoor 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("outdoor") !== -1;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "和 " + target.name + " 一起回家" : "一起回家";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想找对方一起回家但没找到人。" };
    }
    return {
      memory: "我和 " + target.name + " 一起走过了樱花道。今天的樱花比昨天开得又多了一些——走慢一点也没关系。",
      dialogRecord: ctx.self.name + " 和 " + target.name + " 一起沿着樱花道回家。",
      targetMemory: ctx.self.name + " 和我一起走过了樱花道。我们聊了很多——有些话我记得很清楚，有些只是因为那个人的声音很好听。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "同行者角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: false
};

module.exports = [
  kissAction, caressAction, hugAction,
  confessAction,
  holdHandsAction,
  giveGiftAction,
  inviteAction,
  writeLetterAction,
  comfortAction,
  teaseAction,
  studyTogetherAction,
  walkHomeAction
];
