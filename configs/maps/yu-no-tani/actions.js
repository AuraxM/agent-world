/**
 * 湯の谷 map-pack custom actions.
 *
 * Export an array of ActionDefinition objects.
 * They will be registered into the global ActionRegistry at world-load time.
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
 *
 * Example:
 *
 *   module.exports = [
 *     {
 *       type: "brew_tea",
 *       duration: "instant",
 *       check(ctx) { return ctx.here.tags.includes("indoor"); },
 *       hint(ctx) { return `在 ${ctx.here.name} 沏茶品茗`; },
 *       execute(ctx, _input) {
 *         return {
 *           memory: `我在 ${ctx.here.name} 沏了一壶茶，慢慢品味。`,
 *           event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 沏茶。`, intensity: 1 },
 *           stateChanges: [
 *             { kind: "adjustMood", delta: 1 },
 *             { kind: "adjustStress", delta: -1 },
 *           ],
 *         };
 *       },
 *     },
 *   ];
 */

module.exports = [];
