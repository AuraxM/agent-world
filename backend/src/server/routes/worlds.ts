/**
 * World routes: CRUD + tick + events.
 *
 * GET    / — list worlds
 * POST   / — create world
 * GET    /:id — world snapshot
 * DELETE /:id — delete world
 * GET    /:id/events — event log
 * POST   /:id/tick — advance game (SSE)
 */
import type { FastifyPluginAsync } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../db/index";
import { loadWorld, loadEventsSince } from "../../systems/index";
import { createWorldFromConfig } from "../../systems/index";
import { tick } from "../tick.js";

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

const CreateWorldBody = z.object({
  worldId: z.string().min(1),
  name: z.string().min(1),
  mapId: z.string().min(1),
  cast: z.array(CastMemberSchema).min(1),
});

export const worldRoutes: FastifyPluginAsync = async (app) => {
  // GET / — list worlds
  app.get("/", async (_req, reply) => {
    const rows = db
      .select({
        id: schema.worlds.id,
        name: schema.worlds.name,
        mapId: schema.worlds.mapId,
        currentTick: schema.worlds.currentTick,
        updatedAt: schema.worlds.updatedAt,
      })
      .from(schema.worlds)
      .orderBy(desc(schema.worlds.updatedAt))
      .all();

    const worlds = rows.map((w) => {
      const charCount = db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.worldId, w.id))
        .all().length;
      return { ...w, characterCount: charCount };
    });

    return reply.send({ worlds });
  });

  // POST / — create world
  app.post("/", async (req, reply) => {
    const parsed = CreateWorldBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid body",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }

    try {
      const result = createWorldFromConfig(parsed.data);
      return reply.status(201).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("map not found") || message.startsWith("character template not found")) {
        return reply.status(404).send({ error: message });
      }
      if (message.startsWith("world already exists") || message.startsWith("duplicate cast member") ||
          message.includes("locationId not in map") || message.startsWith("config invalid")) {
        return reply.status(400).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // GET /:id — world snapshot
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { id } = req.params;
    try {
      const loaded = loadWorld(id);
      return reply.send({
        world: loaded.world,
        nodes: loaded.nodes,
        characters: loaded.characters,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("world not found")) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // DELETE /:id — delete world
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { id } = req.params;
    const w = db
      .select({ id: schema.worlds.id })
      .from(schema.worlds)
      .where(eq(schema.worlds.id, id))
      .get();
    if (!w) {
      return reply.status(404).send({ error: `world not found: ${id}` });
    }

    db.delete(schema.eventsLog).where(eq(schema.eventsLog.worldId, id)).run();
    db.delete(schema.agentThoughts).where(eq(schema.agentThoughts.worldId, id)).run();
    db.delete(schema.snapshots).where(eq(schema.snapshots.worldId, id)).run();
    db.delete(schema.transactions).where(eq(schema.transactions.worldId, id)).run();
    db.delete(schema.conversations).where(eq(schema.conversations.worldId, id)).run();
    db.delete(schema.thinkSessions).where(eq(schema.thinkSessions.worldId, id)).run();
    db.delete(schema.notebookEntries).where(eq(schema.notebookEntries.worldId, id)).run();
    db.delete(schema.characters).where(eq(schema.characters.worldId, id)).run();
    db.delete(schema.nodes).where(eq(schema.nodes.worldId, id)).run();
    db.delete(schema.worlds).where(eq(schema.worlds.id, id)).run();

    return reply.send({ ok: true, deleted: id });
  });

  // GET /:id/events — event log
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>("/:id/events", async (req, reply) => {
    const { id } = req.params;
    const sinceParam = req.query.since;
    const since = sinceParam ? Number.parseInt(sinceParam, 10) : 0;
    if (Number.isNaN(since) || since < 0) {
      return reply.status(400).send({ error: "invalid `since` query param" });
    }
    try {
      const events = loadEventsSince(id, since);
      return reply.send({ events });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // POST /:id/tick — SSE game tick
  app.post<{ Params: { id: string } }>("/:id/tick", async (req, reply) => {
    const { id } = req.params;

    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };
    reply.raw.writeHead(200, headers);

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await tick(id, {
        onCharacterDecision: (data) => {
          send("decision", data);
        },
      });
      send("done", {
        worldId: result.worldId,
        fromTick: result.fromTick,
        toTick: result.toTick,
        eventCount: result.events.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("world not found")) {
        send("error", { error: message, status: 404 });
      } else {
        send("error", { error: message, status: 500 });
      }
    } finally {
      reply.raw.end();
    }
  });
};
