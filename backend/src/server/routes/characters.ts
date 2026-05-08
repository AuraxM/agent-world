/**
 * Character routes: add / place (SSE) / detail.
 *
 * POST   /:id/characters        — add character
 * POST   /:id/characters/place  — add + decide (SSE)
 * GET    /:id/characters/:cid   — character detail
 */
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { addCharacterToWorld } from "../../systems/index";
import { decideForCharacter } from "../decideForCharacter.js";
import { loadWorld } from "../../systems/index";

const AddCharacterBody = z.object({
  characterId: z.string().min(1),
  entryNodeId: z.string().min(1).optional(),
  vitals: z
    .object({
      hunger: z.number().int().nonnegative().optional(),
      fatigue: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const PlaceCharacterBody = z.object({
  characterId: z.string().min(1),
});

export const characterRoutes: FastifyPluginAsync = async (app) => {
  // POST /:id/characters — add character to world
  app.post<{ Params: { id: string } }>("/:id/characters", async (req, reply) => {
    const parsed = AddCharacterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid body",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }

    try {
      const result = addCharacterToWorld({
        worldId: req.params.id,
        characterId: parsed.data.characterId,
        entryNodeId: parsed.data.entryNodeId,
        vitals: parsed.data.vitals,
      });
      return reply.status(201).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("world not found") || message.startsWith("character template not found")) {
        return reply.status(404).send({ error: message });
      }
      if (message.startsWith("character already in world") ||
          message.startsWith("entry node not in world") ||
          message.startsWith("world has no entry node")) {
        return reply.status(400).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });

  // POST /:id/characters/place — add character + SSE decision
  app.post<{ Params: { id: string } }>("/:id/characters/place", async (req, reply) => {
    const parsed = PlaceCharacterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid body: characterId required",
      });
    }
    const { characterId } = parsed.data;
    const worldId = req.params.id;

    // Run addCharacterToWorld synchronously before SSE to catch validation errors
    let entryNodeId: string;
    let name: string;
    try {
      const r = addCharacterToWorld({ worldId, characterId });
      entryNodeId = r.entryNodeId;
      name = r.name;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("world not found") || message.startsWith("character template not found")) {
        return reply.status(404).send({ error: message });
      }
      if (message.startsWith("character already in world") ||
          message.startsWith("entry node not in world") ||
          message.startsWith("world has no entry node")) {
        return reply.status(400).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }

    const { world } = loadWorld(worldId);
    const tickBefore = world.currentTick;

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
      send("placed", { characterId, entryNodeId });

      const result = await decideForCharacter(worldId, characterId);
      send("decision", {
        characterId,
        characterName: name,
        action: result.action,
      });
      send("done", { characterId, tick: tickBefore });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send("error", { error: message, status: 500 });
    } finally {
      reply.raw.end();
    }
  });

  // GET /:id/characters/:cid — character detail
  app.get<{ Params: { id: string; cid: string } }>("/:id/characters/:cid", async (req, reply) => {
    const { id, cid } = req.params;
    try {
      const loaded = loadWorld(id);
      const character = loaded.characters.find((c) => c.id === cid);
      if (!character) {
        return reply.status(404).send({ error: `character not found: ${cid}` });
      }
      const here = loaded.nodes.find((n) => n.id === character.locationId) ?? null;
      return reply.send({ character, here });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("world not found")) {
        return reply.status(404).send({ error: message });
      }
      return reply.status(500).send({ error: message });
    }
  });
};
