/**
 * 根据角色当前位置 / vitals / emotion / 关系，构造"可选行动"列表。
 *
 * 该列表喂给 LLM 作为参考；LLM 不被强制只能选其中之一（约束在 ActionType 封闭枚举层面）。
 * 每个候选附一段简短上下文提示，目的是给 LLM 充分信息做差异化选择。
 *
 * 反扎堆改进：通过可选 `hints` 参数把 facts / 是否睡眠时段 喂进来，
 * 在 hint 文本里加 ⭐ 推荐 / "你不饿" / "已聊 N 小时" 等情境后缀。
 * 不改变行动**可选性**，仅丰富文本，避免压缩 LLM 自由度。
 */
import type { AggregatedFacts } from "./facts";
import type { Character, MapNode } from "../domain/index";
import {
  actionRegistry,
  type ActionContext as RegistryActionContext,
  type ActionOption,
} from "../domain/index";

export interface AvailableActionsHints {
  facts?: AggregatedFacts;
  /** 来自 prompt.timeOfDay(tick).isSleepHour，避免 actions.ts 反向依赖 prompt.ts */
  isSleepHour?: boolean;
}

export function buildActionContext(
  character: Character,
  nodes: MapNode[],
  characters: Character[],
  worldId: string,
  tick: number,
  epoch: number,
  isSleepHour: boolean,
  facts: AggregatedFacts,
  /** 并发 tick 时传入各角色的位置快照；不传则读 character.locationId */
  locationOverrides?: ReadonlyMap<string, string>,
): RegistryActionContext {
  const loc = locationOverrides?.get(character.id) ?? character.locationId;
  const here = nodes.find((n) => n.id === loc);
  if (!here) {
    throw new Error(
      `character ${character.id} located at unknown node ${loc}`,
    );
  }

  const companions = characters.filter(
    (c) =>
      c.id !== character.id &&
      (locationOverrides?.get(c.id) ?? c.locationId) === loc,
  );

  const reachable = nodes.filter((n) => n.id !== loc);

  return {
    worldId,
    tick,
    epoch,
    self: character,
    here,
    companions,
    reachable,
    isSleepHour,
    facts,
  };
}

export function getAvailableActions(
  ctx: RegistryActionContext,
  _hints?: AvailableActionsHints,
): ActionOption[] {
  return actionRegistry.buildOptions(ctx);
}

// Re-export so other files can import from here.
export type { ActionOption, RegistryActionContext as ActionContext };
