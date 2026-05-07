/**
 * Config routes: character templates and map lists.
 *
 * GET /characters — list character templates
 * GET /maps       — list available maps
 */
import type { FastifyPluginAsync } from "fastify";
import { loadAllCharacters, loadAllMaps, loadManifest } from "@agw/config";

export const configRoutes: FastifyPluginAsync = async (app) => {
  // GET /characters — list character templates
  app.get("/characters", async (_req, reply) => {
    try {
      const characters = loadAllCharacters().map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar ?? null,
        origin: c.origin,
        personality: c.personality,
        relationCount: Object.keys(c.relations).length,
      }));
      return reply.send({ characters });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  // GET /maps — list available maps
  app.get("/maps", async (_req, reply) => {
    try {
      const maps = loadAllMaps().map((m) => {
        let name = m.id;
        let description = "";
        try {
          const manifest = loadManifest(m.id);
          name = manifest.name;
          description = manifest.description ?? "";
        } catch { /* use id as name */ }
        return {
          id: m.id,
          name,
          description,
          nodeCount: m.nodes.length,
          entries: m.nodes
            .filter((n) => n.isEntry)
            .map((n) => ({ id: n.id, name: n.name })),
        };
      });
      return reply.send({ maps });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });
};
