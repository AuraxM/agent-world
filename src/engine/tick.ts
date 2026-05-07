/**
 * Re-export: tick 编排逻辑已迁移到 apps/server/src/tick.ts。
 * 保留此文件以兼容 @/engine/tick 导入路径（scripts、测试等）。
 */
export {
  tick,
  type TickOptions,
  type TickResult,
  type DecideFn,
  type DecideInput,
  type LoadedWorld,
} from "../../apps/server/src/tick";
