/**
 * 配置文件层的领域类型。
 *
 * 与 `src/domain/types.ts` 的运行时类型有意区分：
 *   - `MapNodeConfig` 不含 `worldId`（实例化世界时才知道）
 *   - `CharacterTemplate` 是位置无关的角色模板，不含 `worldId / locationId /
 *     vitals / emotion / shortMemory / longMemory / currentAction / lastThought`
 *     —— 这些都是世界运行期才存在的字段。
 */
import type { MapNode, Character } from "@/domain/types";

/** 文件里写的节点：去掉运行时才有的 worldId。 */
export type MapNodeConfig = Omit<MapNode, "worldId">;

/** 一份地图配置文件 = 一棵节点树 + 元信息。 */
export interface MapConfig {
  id: string;
  name: string;
  description?: string;
  nodes: MapNodeConfig[];
}

/** 一份角色配置文件 = 不含位置/世界/运行期字段的纯模板。 */
export type CharacterTemplate = Omit<
  Character,
  | "worldId"
  | "locationId"
  | "vitals"
  | "emotion"
  | "shortMemory"
  | "longMemory"
  | "currentAction"
  | "lastThought"
>;
