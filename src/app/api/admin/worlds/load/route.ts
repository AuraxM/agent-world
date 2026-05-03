import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";
import {
  loadCharactersForMap,
  validateMapPack,
} from "@/config/loader";

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
  mapId: z.string().min(1),
  cast: z.array(CastMemberSchema).optional(),
});

const DEFAULT_WORLD_ID = "world-default";

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

  const { mapId, cast: castInput } = parsed.data;

  // Validate pack format first
  const validation = validateMapPack(mapId);
  if (!validation.valid) {
    return Response.json(
      { error: "map pack validation failed", errors: validation.errors },
      { status: 400 },
    );
  }

  try {
    // Build cast: if not provided, use all characters in the pack
    let cast: CastMember[];
    if (castInput) {
      cast = castInput.map((c) => ({
        characterId: c.characterId,
        locationId: c.locationId,
        vitals: c.vitals,
      }));
    } else {
      const allChars = loadCharactersForMap(mapId);
      cast = allChars.map((c) => ({
        characterId: c.id,
      }));
    }

    const worldId = DEFAULT_WORLD_ID;

    // Delete existing world
    db.delete(schema.worlds).where(eq(schema.worlds.id, worldId)).run();

    const result = createWorldFromConfig({
      worldId,
      name: validation.name,
      mapId,
      cast,
    });

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
