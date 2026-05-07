/**
 * Action 系统核心类型和全局 ActionRegistry 单例。
 * 此文件为 re-export；实现已迁移到 @agw/domain。
 */
export {
  type ActionContext,
  type ActionDefinition,
  type ActionOption,
  actionRegistry,
  type Outcome,
  type StateChange,
} from "@agw/domain";
// AggregatedFacts is re-exported from the original file; keep for backward compat
