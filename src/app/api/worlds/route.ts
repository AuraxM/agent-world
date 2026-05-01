/**
 * POST /api/worlds
 * 创建一个新世界：选地图 + 选 cast + 选每人初始位置（可选）。
 *
 * Body: {
 *   worldId, name, mapId,
 *   cast: [{ characterId, locationId?, vitals? }]
 * }
 */
import { z } from "zod";
import { createWorldFromConfig } from "@/engine/createWorld";

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
  worldId: z.string().min(1),
  name: z.string().min(1),
  mapId: z.string().min(1),
  cast: z.array(CastMemberSchema).min(1),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = createWorldFromConfig(parsed.data);
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("map not found") ||
        message.startsWith("character template not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("world already exists") ||
        message.startsWith("duplicate cast member") ||
        message.includes("locationId not in map") ||
        message.startsWith("config invalid")) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
