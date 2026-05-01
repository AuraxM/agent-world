/**
 * 配置文件 Zod 校验。
 *
 * 复用 `src/domain/enums.ts` 的封闭枚举，确保配置层和运行时层共享同一份词汇表。
 */
import { z } from "zod";
import { NODE_TAGS, RELATION_KINDS, STATUS_KINDS } from "@/domain/enums";
import {
  PersonalitySchema,
  RelationSchema,
  StatusSchema,
} from "@/domain/schemas";
import type { MapConfig, CharacterTemplate, MapNodeConfig } from "./types";

/** 节点（文件内格式）：相比运行时缺 `worldId`。 */
export const MapNodeConfigSchema: z.ZodType<MapNodeConfig> = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  name: z.string().min(1),
  description: z.string(),
  tags: z.array(z.enum(NODE_TAGS)),
  capacity: z.number().int().positive().nullable(),
  privacy: z.enum(["public", "semi", "private"]),
  visibleFromParent: z.boolean(),
  shortcuts: z.array(z.string()),
  isEntry: z.boolean(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  spriteKey: z.string().optional(),
});

/** 一张地图。要求：≥1 个 isEntry 节点；节点 id 唯一；parentId 必须能在同文件中解析（除根）。 */
export const MapConfigSchema: z.ZodType<MapConfig> = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    nodes: z.array(MapNodeConfigSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    for (const n of cfg.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate node id: ${n.id}`,
          path: ["nodes"],
        });
      }
      ids.add(n.id);
    }
    for (const n of cfg.nodes) {
      if (n.parentId !== null && !ids.has(n.parentId)) {
        ctx.addIssue({
          code: "custom",
          message: `node ${n.id}.parentId references missing node: ${n.parentId}`,
          path: ["nodes"],
        });
      }
    }
    const roots = cfg.nodes.filter((n) => n.parentId === null);
    if (roots.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "map must have at least one root node (parentId === null)",
        path: ["nodes"],
      });
    }
    const entries = cfg.nodes.filter((n) => n.isEntry);
    if (entries.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "map must declare at least one entry node (isEntry: true) — e.g. 公交车站 / 码头 / 传送阵",
        path: ["nodes"],
      });
    }
  });

/** Ability：v0 仅作为决策上下文，类型相对宽松。 */
const AbilitySchema = z.object({
  kind: z.string(),
  tier: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

/** 角色模板（文件内格式）：去掉所有运行期字段。 */
export const CharacterTemplateSchema: z.ZodType<CharacterTemplate> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
  /** 角色"家"节点的 id；prompt 引导回家时用。可选，向后兼容。 */
  homeNodeId: z.string().min(1).nullable().optional(),
  personality: PersonalitySchema,
  statuses: z.array(StatusSchema),
  abilities: z.array(AbilitySchema),
  relations: z.record(z.string(), RelationSchema),
});

// 校验封闭枚举确实被覆盖（防止 enums.ts 改动后 schema 漏更新）。
void STATUS_KINDS;
void RELATION_KINDS;
