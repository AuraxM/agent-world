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

/** 地图包支持的输出语言。 */
export type Language = "zh" | "en" | "ja";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["zh", "en", "ja"];

/** 文件里写的节点：去掉运行时才有的 worldId。 */
export type MapNodeConfig = Omit<MapNode, "worldId">;

/** 一份地图配置文件 = 一棵节点树。name/description 移到 manifest。 */
export interface MapConfig {
  id: string;
  nodes: MapNodeConfig[];
}

/** 地图包 manifest —— 每个地图包目录下的 manifest.json。 */
export interface Manifest {
  id: string;
  name: string;
  description?: string;
  language: Language;
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
