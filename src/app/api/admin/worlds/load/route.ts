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

const WORLD_ID_PREFIX = "world";

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

    const worldId = `${WORLD_ID_PREFIX}-${mapId}`;

    // Delete existing world + child rows explicitly.
    // SQLite PRAGMA foreign_keys may not be active on all connections,
    // so we clean up child tables manually instead of relying on ON DELETE CASCADE.
    db.delete(schema.eventsLog).where(eq(schema.eventsLog.worldId, worldId)).run();
    db.delete(schema.agentThoughts).where(eq(schema.agentThoughts.worldId, worldId)).run();
    db.delete(schema.snapshots).where(eq(schema.snapshots.worldId, worldId)).run();
    db.delete(schema.transactions).where(eq(schema.transactions.worldId, worldId)).run();
    db.delete(schema.conversations).where(eq(schema.conversations.worldId, worldId)).run();
    db.delete(schema.thinkSessions).where(eq(schema.thinkSessions.worldId, worldId)).run();
    db.delete(schema.notebookEntries).where(eq(schema.notebookEntries.worldId, worldId)).run();
    db.delete(schema.characters).where(eq(schema.characters.worldId, worldId)).run();
    db.delete(schema.nodes).where(eq(schema.nodes.worldId, worldId)).run();
    db.delete(schema.worlds).where(eq(schema.worlds.id, worldId)).run();

    const result = createWorldFromConfig({
      worldId,
      name: validation.name,
      mapId,
      cast,
    });

    globalThis.__agent_world_llm_clients__ = undefined;

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
