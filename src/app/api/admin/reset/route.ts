/**
 * POST /api/admin/reset — 重置游戏世界（删除当前世界并重新 seed）
 *
 * Body: { worldId?, mapId?, cast? } 均可选，默认重置 moon-valley。
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";

const VitalsOverride = z
  .object({
    hunger: z.number().int().nonnegative().optional(),
    fatigue: z.number().int().nonnegative().optional(),
  })
  .optional();

const CastMemberSchema = z.object({
  characterId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  vitals: VitalsOverride,
});

const BodySchema = z.object({
  worldId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  mapId: z.string().min(1).optional(),
  cast: z.array(CastMemberSchema).min(1).optional(),
});

const DEFAULT_WORLD_ID = "world-yu-no-tani";
const DEFAULT_MAP_ID = "yu-no-tani";
const DEFAULT_CAST: CastMember[] = [
  { characterId: "char-yumori-kosuke" },
  { characterId: "char-ogawa-saori" },
  { characterId: "char-nakamura-yuto" },
  { characterId: "char-yamada-takafumi" },
  { characterId: "char-tanimura-kinuyo" },
  { characterId: "char-matsuoka-sayo" },
  { characterId: "char-suzuki-kazuo" },
  { characterId: "char-tanaka-yayoi" },
  { characterId: "char-tazaki-mamoru" },
  { characterId: "char-sato-haru" },
  { characterId: "char-guji-masayuki" },
  { characterId: "char-kishita-michiko" },
  { characterId: "char-yoshida-eiichi" },
  { characterId: "char-okubo-kenta" },
  { characterId: "char-okubo-miwa" },
  { characterId: "char-shiraishi-aoi" },
  { characterId: "char-nogami-takashi" },
];

export async function POST(request: Request) {
  let json: unknown = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      json = await request.json();
    }
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const worldId = parsed.data.worldId ?? DEFAULT_WORLD_ID;
    const mapId = parsed.data.mapId ?? DEFAULT_MAP_ID;
    const cast = parsed.data.cast ?? DEFAULT_CAST;

    // 级联删除旧世界
    db.delete(schema.worlds).where(eq(schema.worlds.id, worldId)).run();

    const result = createWorldFromConfig({
      worldId,
      name: parsed.data.name ?? "汤之谷",
      mapId,
      cast,
    });

    // 清除 LLM client 缓存（世界重置后重新开始）
    globalThis.__agent_world_llm__ = undefined;

    return Response.json({
      ok: true,
      world: {
        id: result.worldId,
        mapId: result.mapId,
        characterIds: result.characterIds,
        defaultEntryNodeId: result.defaultEntryNodeId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.startsWith("map not found") ||
      message.startsWith("character template not found")
    ) {
      return Response.json({ error: message }, { status: 404 });
    }
    if (
      message.startsWith("world already exists") ||
      message.startsWith("duplicate cast member") ||
      message.includes("locationId not in map") ||
      message.startsWith("config invalid")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
