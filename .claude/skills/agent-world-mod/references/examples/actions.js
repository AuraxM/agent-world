/**
 * Example actions.js for a hypothetical scene.
 *
 * Export an array of ActionDefinition objects.
 * They are registered into the global ActionRegistry at world-load time.
 * Any type name that matches a built-in action will override it for this world.
 *
 * Interface (see backend/src/domain/action-system.ts):
 *
 *   interface ActionDefinition {
 *     type: string;
 *     duration: "instant" | number;
 *     triggerHint: string;     // when to use ("在……时使用" pattern)
 *     paramRule: string;       // 必填/可选/无需 + location/time constraints
 *     check(ctx: ActionContext): boolean;
 *     hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;
 *     execute(ctx: ActionContext, input: ActionInput): Outcome;
 *     validateParams?(input: ActionInput, ctx: ActionContext): string | null;
 *     onTick?(ctx: ActionContext): Outcome | null;
 *     onComplete?(ctx: ActionContext): Outcome;
 *     onInterrupt?(ctx: ActionContext, reason: string): Outcome;
 *     extraParams?: Record<string, unknown>;
 *     extraRequired?: string[];
 *     usableInDialogue?: boolean;
 *   }
 */

module.exports = [
  // ---- Instant action with vitals reset ----
  {
    type: "hot_spring_bathe",
    duration: "instant",
    triggerHint: "感到疲惫或卫生指标偏高，且当前位于户外温泉时使用，放松身心并恢复清洁。",
    paramRule: "可选 free_text（描述泡汤过程或心情）。仅在含 bathing + outdoor 标签的节点可用。",
    check(ctx) {
      return ctx.here.tags.includes("bathing") && ctx.here.tags.includes("outdoor");
    },
    hint(ctx) {
      const h = ctx.self.vitals.hygiene;
      if (h >= 13) return `⭐ 温泉洗浴（已 ${h} 小时未洗浴）`;
      if (h >= 8) return "⭐ 温泉洗浴";
      return "温泉洗浴（放松身心）";
    },
    execute(ctx, input) {
      const desc = input.free_text || "在温泉中泡了一会儿";
      return {
        memory: `我在 ${ctx.here.name} ${desc}，浑身舒畅。`,
        event: {
          category: "action",
          description: `${ctx.self.name} 在 ${ctx.here.name} 泡温泉。`,
          intensity: 1,
        },
        stateChanges: [
          { kind: "resetVital", vital: "hygiene" },
          { kind: "adjustMood", delta: 2 },
          { kind: "adjustStress", delta: -1 },
        ],
      };
    },
  },

  // ---- Multi-tick action with onTick / onComplete ----
  {
    type: "meditate",
    duration: 4,
    triggerHint: "压力较高、需要独处整理思绪时使用，持续 4 个 tick，期间会被高强度事件打断。",
    paramRule: "可选 free_text（冥想的主题或意图）。需在私密节点或带 quiet 标签的节点。",
    check(ctx) {
      return ctx.here.privacy === "private" || ctx.here.tags.includes("quiet");
    },
    hint(ctx) {
      if (ctx.self.emotion.stress >= 8) return "⭐ 冥想（压力很大，需要放松）";
      return "冥想";
    },
    execute(ctx, input) {
      return {
        memory: `我在 ${ctx.here.name} 开始冥想，闭上双眼。`,
        event: {
          category: "inner",
          description: `${ctx.self.name} 在 ${ctx.here.name} 开始冥想。`,
          intensity: 1,
          scope: "private",
        },
        stateChanges: [{
          kind: "setOngoingAction",
          action: {
            type: "meditate",
            startedAt: ctx.tick,
            endsAt: ctx.tick + 4,
            freeText: input.free_text || "深沉呼吸",
          },
        }],
      };
    },
    onTick(ctx) {
      const elapsed = ctx.tick - ctx.self.ongoingAction.startedAt;
      if (elapsed % 2 === 0) {
        return {
          memory: "呼吸平缓，心静下来。",
          stateChanges: [{ kind: "adjustStress", delta: -1 }],
        };
      }
      return null;
    },
    onComplete(ctx) {
      return {
        memory: "我结束了冥想，感觉神清气爽。",
        event: {
          category: "inner",
          description: `${ctx.self.name} 结束了冥想。`,
          intensity: 1,
        },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustStress", delta: -2 },
        ],
      };
    },
    onInterrupt(ctx, reason) {
      return {
        memory: `我被打断了冥想——${reason}`,
        event: {
          category: "inner",
          description: `${ctx.self.name} 被打断了冥想。`,
          intensity: 2,
        },
      };
    },
  },

  // ---- Action with dialog request ----
  {
    type: "greet",
    duration: "instant",
    triggerHint: "想发起对话或寒暄时使用——会向目标发起 dialog request，对方接受后进入对话。",
    paramRule: "必填 target_id（打招呼对象）+ 可选 free_text（具体说什么）。需当前节点非 private。",
    validateParams(input, ctx) {
      if (!input.target_id) return "greet 需要指定 target_id（打招呼对象）";
      if (!ctx.companions.find(function(c) { return c.id === input.target_id; })) {
        return "target_id=\"" + input.target_id + "\" 不在身边，无法打招呼";
      }
      return null;
    },
    check(ctx) {
      return ctx.companions.length > 0 && ctx.here.privacy !== "private";
    },
    hint(ctx) {
      return ctx.companions
        .filter(function(c) { return c.id !== ctx.self.id; })
        .map(function(c) {
          return { hint: `和 ${c.name} 打招呼`, targetId: c.id };
        });
    },
    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(function(c) { return c.id === targetId; });
      const line = input.free_text || `你好，${target ? target.name : ""}。`;
      return {
        memory: `我向 ${target ? target.name : targetId} 打招呼：「${line}」`,
        event: {
          category: "social",
          description: `${ctx.self.name} 向 ${target ? target.name : targetId} 打招呼。`,
          intensity: 1,
        },
        dialogRequest: { targetId: targetId, openingLine: line },
      };
    },
  },
];
