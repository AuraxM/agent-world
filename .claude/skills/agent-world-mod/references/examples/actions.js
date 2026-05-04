/**
 * Example actions.js for a hypothetical map pack.
 *
 * Export an array of ActionDefinition objects.
 * They are registered into the global ActionRegistry at world-load time.
 * Any type name that matches a built-in action will override it for this world.
 *
 * Interface (see src/domain/action-system.ts):
 *
 *   interface ActionDefinition {
 *     type: string;
 *     duration: "instant" | number;
 *     check(ctx: ActionContext): boolean;
 *     hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;
 *     execute(ctx: ActionContext, input: ActionInput): Outcome;
 *     onTick?(ctx: ActionContext): Outcome | null;
 *     onComplete?(ctx: ActionContext): Outcome;
 *     onInterrupt?(ctx: ActionContext, reason: string): Outcome;
 *   }
 */

module.exports = [
  // ---- Instant action with vitals reset ----
  {
    type: "hot_spring_bathe",
    duration: "instant",
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
