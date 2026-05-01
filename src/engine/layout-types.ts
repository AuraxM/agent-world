/**
 * 布局引擎的类型定义。
 * 中间产物 skeleton.json 的结构，不是运行时 domain 类型。
 */

export interface LayoutParams {
  canvasW: number;
  canvasH: number;
  elevationLayers: number;
  mainRoadCount: number;
  crossRoadMin: number;
  crossRoadMax: number;
  density: "sparse" | "medium" | "dense";
  zoneRatios: { commercial: number; residential: number; public: number; edge: number };
  seed: number;
}

export const DEFAULT_PARAMS: LayoutParams = {
  canvasW: 48,
  canvasH: 36,
  elevationLayers: 3,
  mainRoadCount: 1,
  crossRoadMin: 2,
  crossRoadMax: 4,
  density: "medium",
  zoneRatios: { commercial: 0.20, residential: 0.45, public: 0.10, edge: 0.25 },
  seed: Date.now(),
};

export type RoadDir = "h" | "v";

export interface Road {
  id: string;
  dir: RoadDir;
  /** 道路中心线的 x（竖街）或 y（横街） */
  offset: number;
  /** 道路宽度（格） */
  w: number;
  /** 道路起止（横街 xStart/xEnd；竖街 yStart/yEnd） */
  start: number;
  end: number;
  name: string;
}

export interface Elevation {
  layer: number;
  yStart: number;
  yEnd: number;
  label: string;
}

export type Zone = "commercial" | "residential" | "public" | "edge";

export interface Slot {
  id: string;
  zone: Zone;
  x: number;
  y: number;
  w: number;
  h: number;
  roadAccess: string;
  elevation: number;
  suggestedTags: string[];
  isEntry: boolean;
  capacityHint: number;
}

export interface Skeleton {
  canvas: { w: number; h: number };
  roads: Road[];
  elevations: Elevation[];
  slots: Slot[];
}

/** LLM 填充后的节点声明（node 内容 + 可选的合并来源） */
export interface FilledNode {
  /** 对应骨架中的 slot id */
  slotId: string;
  /** 合并来源：若合并多个 slot，列出全部 slot id */
  mergedFrom?: string[];
  /** 是否跳过此 slot */
  skipped?: boolean;
  /** 节点内容（符合 MapNodeConfig 结构，不含 x/y/w/h） */
  node: {
    id: string;
    parentId: string | null;
    name: string;
    description: string;
    tags: string[];
    capacity: number | null;
    privacy: "public" | "semi" | "private";
    visibleFromParent: boolean;
    shortcuts: string[];
    isEntry: boolean;
    travelCost?: number;
    spriteKey?: string;
  };
}

/** 填充骨架：骨架 + LLM 生成的节点列表 */
export interface FilledSkeleton {
  skeleton: Skeleton;
  filledNodes: FilledNode[];
}
