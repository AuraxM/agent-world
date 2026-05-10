/**
 * Config routes: character templates, map lists, scene assets.
 *
 * GET /characters           — list character templates
 * GET /maps                 — list available maps
 * GET /scenes/:id/card-bg   — serve mod card background image
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { loadAllCharacters, loadAllMaps, loadManifest, loadCharactersForMap } from "../../config/index";

const SCENES_DIR =
  process.env.AGENT_WORLD_SCENES_DIR
    ? resolve(process.env.AGENT_WORLD_SCENES_DIR)
    : resolve(process.cwd(), "scenes");

export const configRoutes: FastifyPluginAsync = async (app) => {
  // GET /characters — list character templates
  app.get<{ Querystring: { mapId?: string } }>("/characters", async (req, reply) => {
    try {
      let chars = loadAllCharacters();
      if (req.query.mapId) {
        chars = loadCharactersForMap(req.query.mapId);
      }
      const characters = chars.map((c) => ({
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
        let language = "zh";
        let characterCount = 0;
        let backgroundImage: string | null = null;
        try {
          const manifest = loadManifest(m.id);
          name = manifest.name;
          description = manifest.description ?? "";
          language = manifest.language ?? "zh";
          const chars = loadCharactersForMap(m.id);
          characterCount = chars.length;
        } catch { /* use id as name */ }
        const cardBgPath = resolve(SCENES_DIR, m.id, "card-bg.png");
        if (existsSync(cardBgPath)) {
          backgroundImage = `/api/configs/scenes/${m.id}/card-bg`;
        }
        return {
          id: m.id,
          name,
          description,
          language,
          characterCount,
          backgroundImage,
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

  // GET /scenes/:id/card-bg — serve mod card background image
  app.get<{ Params: { id: string } }>("/scenes/:id/card-bg", async (req, reply) => {
    const { id } = req.params;
    // basic path traversal guard
    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      return reply.status(400).send({ error: "invalid scene id" });
    }
    const filePath = resolve(SCENES_DIR, id, "card-bg.png");
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: "card background not found" });
    }
    const buf = readFileSync(filePath);
    return reply.header("Content-Type", "image/png").header("Cache-Control", "public, max-age=86400").send(buf);
  });
};
