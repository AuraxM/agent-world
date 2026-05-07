/**
 * Admin routes: map packs, maps, worlds/load, providers, entry configs.
 *
 * GET    /map-packs                    — list map packs + active world
 * GET    /maps/:id                     — map detail
 * POST   /worlds/load                  — load/reload world
 * GET    /providers                    — list providers
 * POST   /providers                    — create provider
 * PATCH  /providers/:id                — update provider
 * DELETE /providers/:id                — delete provider
 * POST   /providers/:id/activate       — activate provider
 * GET    /entry-configs                — list entry configs
 * PUT    /entry-configs                — batch upsert entry configs
 */
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@agw/db";
import {
  listMapPackIds,
  validateMapPack,
  loadMap,
  loadCharactersForMap,
} from "@agw/config";
import { createWorldFromConfig, type CastMember } from "@agw/systems";
import {
  createProvider,
  listProviders,
  maskApiKey,
  deleteProvider,
  getProvider,
  updateProvider,
  setActiveProvider,
  listEntryConfigs,
  batchUpsertEntryConfigs,
  getDefaultProviderId,
} from "@agw/llm";

const ALL_ENTRY_NAMES = [
  "decide",
  "salvage",
  "dialog_turn",
  "dialog_summarize",
  "dialog_personal_memory",
  "accept_decision",
  "character_placement",
  "memory_compress",
];

const WORLD_ID_PREFIX = "world";

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // GET /map-packs
  app.get("/map-packs", async (_req, reply) => {
    try {
      const packIds = listMapPackIds();
      const packs = packIds.map((id) => validateMapPack(id));

      const worlds = db
        .select()
        .from(schema.worlds)
        .orderBy(desc(schema.worlds.updatedAt))
        .limit(1)
        .all();

      let activeWorld: {
        id: string;
        mapId: string;
        name: string;
        currentTick: number;
        characterCount: number;
      } | null = null;

      if (worlds.length > 0) {
        const w = worlds[0];
        const chars = db
          .select()
          .from(schema.characters)
          .where(eq(schema.characters.worldId, w.id))
          .all();

        activeWorld = {
          id: w.id,
          mapId: w.mapId,
          name: w.name,
          currentTick: w.currentTick,
          characterCount: chars.length,
        };
      }

      return reply.send({ packs, activeWorld });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // GET /maps/:id
  app.get<{ Params: { id: string } }>("/maps/:id", async (req, reply) => {
    const { id } = req.params;
    try {
      const map = loadMap(id);
      const entryNodeId = map.nodes.find((n) => n.isEntry)?.id ?? null;
      return reply.send({
        map: {
          ...map,
          entryNodeId,
          nodeCount: map.nodes.length,
          rootNodes: map.nodes.filter((n) => n.parentId === null).map((n) => n.id),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("map not found")) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // POST /worlds/load
  app.post("/worlds/load", async (req, reply) => {
    const BodySchema = z.object({
      mapId: z.string().min(1),
      cast: z
        .array(
          z.object({
            characterId: z.string().min(1),
            locationId: z.string().min(1).optional(),
            vitals: z
              .object({
                hunger: z.number().int().nonnegative().optional(),
                fatigue: z.number().int().nonnegative().optional(),
              })
              .optional(),
          }),
        )
        .optional(),
    });

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid body",
        issues: parsed.error.issues,
      });
    }

    const { mapId, cast: castInput } = parsed.data;

    const validation = validateMapPack(mapId);
    if (!validation.valid) {
      return reply.status(400).send({
        error: "map pack validation failed",
        errors: validation.errors,
      });
    }

    try {
      let cast: CastMember[];
      if (castInput) {
        cast = castInput.map((c) => ({
          characterId: c.characterId,
          locationId: c.locationId,
          vitals: c.vitals,
        }));
      } else {
        const allChars = loadCharactersForMap(mapId);
        cast = allChars.map((c) => ({ characterId: c.id }));
      }

      const worldId = `${WORLD_ID_PREFIX}-${mapId}`;

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

      return reply.send({
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
      if (message.startsWith("map not found") || message.startsWith("character template not found")) {
        return reply.status(404).send({ error: message });
      }
      if (
        message.startsWith("world already exists") ||
        message.startsWith("duplicate cast member") ||
        message.includes("locationId not in map") ||
        message.startsWith("config invalid")
      ) {
        return reply.status(400).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // GET /providers
  app.get("/providers", async (_req, reply) => {
    try {
      const providers = listProviders();
      return reply.send({
        providers: providers.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // POST /providers
  app.post("/providers", async (req, reply) => {
    const BodySchema = z.object({
      name: z.string().min(1),
      baseUrl: z.string().min(1),
      apiKey: z.string().min(1),
      model: z.string().min(1),
    });

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid body",
        issues: parsed.error.issues,
      });
    }

    try {
      const provider = createProvider(parsed.data);
      return reply.status(201).send({
        provider: { ...provider, apiKey: maskApiKey(provider.apiKey) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // PATCH /providers/:id
  app.patch<{ Params: { id: string } }>("/providers/:id", async (req, reply) => {
    const { id } = req.params;
    const BodySchema = z.object({
      name: z.string().min(1).optional(),
      baseUrl: z.string().min(1).optional(),
      apiKey: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
    });

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid body",
        issues: parsed.error.issues,
      });
    }

    try {
      const provider = updateProvider(id, parsed.data);
      return reply.send({
        provider: provider
          ? { ...provider, apiKey: maskApiKey(provider.apiKey) }
          : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("provider not found")) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // DELETE /providers/:id
  app.delete<{ Params: { id: string } }>("/providers/:id", async (req, reply) => {
    const { id } = req.params;

    try {
      const existing = getProvider(id);
      if (!existing) {
        return reply.status(404).send({ error: "provider not found" });
      }
      if (existing.isActive) {
        return reply.status(400).send({ error: "cannot delete the active provider" });
      }
      deleteProvider(id);
      return reply.send({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // POST /providers/:id/activate
  app.post<{ Params: { id: string } }>("/providers/:id/activate", async (req, reply) => {
    const { id } = req.params;

    try {
      const provider = setActiveProvider(id);
      return reply.send({
        provider: { ...provider, apiKey: maskApiKey(provider.apiKey) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("provider not found")) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // GET /entry-configs
  app.get("/entry-configs", async (_req, reply) => {
    try {
      const entryConfigs = listEntryConfigs(ALL_ENTRY_NAMES);
      let defaultProvider: { id: string; name: string; model: string } | null = null;
      try {
        const dpId = getDefaultProviderId();
        const dp = getProvider(dpId);
        if (dp) {
          defaultProvider = { id: dp.id, name: dp.name, model: dp.model };
        }
      } catch { /* no default provider */ }
      return reply.send({ entryConfigs, defaultProvider });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // PUT /entry-configs
  app.put("/entry-configs", async (req, reply) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body?.entryConfigs || !Array.isArray(body.entryConfigs)) {
      return reply.status(400).send({ error: "entryConfigs array required" });
    }

    try {
      batchUpsertEntryConfigs(
        body.entryConfigs as { entryName: string; providerId: string | null; thinkingEnabled: boolean }[],
      );
      return reply.send({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });
};
