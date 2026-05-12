import Fastify from "fastify";
import cors from "@fastify/cors";
import { worldRoutes } from "./routes/worlds.js";
import { characterRoutes } from "./routes/characters.js";
import { configRoutes } from "./routes/config.js";
import { adminRoutes } from "./routes/admin.js";
import { strangerChatRoutes } from "./routes/stranger-chat.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "0.0.0.0";

start();

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(worldRoutes, { prefix: "/api/worlds" });
  await app.register(characterRoutes, { prefix: "/api/worlds" });
  await app.register(strangerChatRoutes, { prefix: "/api/worlds" });
  await app.register(configRoutes, { prefix: "/api/configs" });
  await app.register(adminRoutes, { prefix: "/api/admin" });

  app.get("/api/health", async () => ({ status: "ok" }));

  try {
    await app.listen({ port, host });
    console.log(`Server running on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
