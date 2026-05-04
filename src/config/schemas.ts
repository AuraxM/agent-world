/**
 * 配置文件 Zod 校验。
 *
 * 复用 `src/domain/enums.ts` 的封闭枚举，确保配置层和运行时层共享同一份词汇表。
 */
import { z } from "zod";
import { NODE_TAGS, OBJECTIVE_RELATION_KINDS, PROFESSIONS, GENDERS, CHARACTER_ORIGINS } from "@/domain/enums";
import { PersonalitySchema, RelationSchema } from "@/domain/schemas";
import type { Manifest, MapConfig, CharacterTemplate, MapNodeConfig, EconomyConfig, SurvivalCosts, ProfessionIncomes, BalanceThresholds } from "./types";

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
  travelCost: z.number().int().min(0).optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  spriteKey: z.string().optional(),
});

const SurvivalCostsSchema: z.ZodType<SurvivalCosts> = z.object({
  eat: z.number().int().min(0),
  bathe: z.number().int().min(0),
});

const ProfessionIncomeRangeSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

const ProfessionIncomesSchema: z.ZodType<ProfessionIncomes> = z.object({
  high: ProfessionIncomeRangeSchema,
  medium: ProfessionIncomeRangeSchema,
  low: ProfessionIncomeRangeSchema,
  none: ProfessionIncomeRangeSchema,
});

const BalanceThresholdsSchema: z.ZodType<BalanceThresholds> = z.object({
  positive: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  negative: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export const EconomyConfigSchema: z.ZodType<EconomyConfig> = z.object({
  survivalCosts: SurvivalCostsSchema,
  professionIncomes: ProfessionIncomesSchema,
  wealthTiers: z.tuple([z.number(), z.number(), z.number()]),
  balanceThresholds: BalanceThresholdsSchema,
  tierMultipliers: z.record(z.string(), z.number()).optional(),
  mdc: z.number().int().min(1).optional(),
});

/** 地图包 manifest —— 每个地图包目录下的 manifest.json。 */
export const ManifestSchema: z.ZodType<Manifest> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  language: z.enum(["zh", "en", "ja"]),
  startDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "must be a valid ISO 8601 datetime string",
    })
    .optional(),
  actions: z.string().optional(),
  events: z.string().optional(),
  economy: EconomyConfigSchema.optional(),
});

/** 一张地图。要求：≥1 个 isEntry 节点；节点 id 唯一；parentId 必须能在同文件中解析（除根）。 */
export const MapConfigSchema: z.ZodType<MapConfig> = z
  .object({
    id: z.string().min(1),
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

const SleepWindowSchema = z.object({
  start: z.number().int().min(0).max(23),
  duration: z.number().int().min(4).max(12),
});

/** 角色模板（文件内格式）：去掉所有运行期字段。 */
export const CharacterTemplateSchema: z.ZodType<CharacterTemplate> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
  age: z.number().int().min(1).max(120),
  gender: z.enum(GENDERS),
  profession: z.enum(PROFESSIONS),
  biography: z.string().min(1),
  origin: z.enum(CHARACTER_ORIGINS),
  activityNodeId: z.string().min(1).nullable().optional(),
  restNodeId: z.string().min(1).nullable().optional(),
  sleepWindow: SleepWindowSchema.optional(),
  personality: PersonalitySchema,
  abilities: z.array(AbilitySchema),
  appearance: z.number().int().min(1).max(4),
  intelligence: z.number().int().min(1).max(4),
  health: z.number().int().min(1).max(4),
  speakingStyle: z.string().optional(),
  relations: z.record(z.string(), RelationSchema),
  impressionBook: z.record(z.string(), z.string()).optional().default({}),
  initialMoney: z.number().int().min(0).optional(),
  expenseExempt: z.boolean().optional(),
  incomeMultiplier: z.number().min(0).optional(),
});

// 校验封闭枚举确实被引用（防止 enums.ts 改动后 schema 漏更新）。
void OBJECTIVE_RELATION_KINDS;
