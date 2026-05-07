/**
 * GET /api/worlds/:id
 * 返回当前世界的完整快照：world meta + nodes + characters。
 *
 * DELETE /api/worlds/:id
 * 删除一个世界及其所有关联数据。
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { loadWorld } from "@/engine/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/worlds/[id]">,
) {
  const { id } = await ctx.params;
  try {
    const loaded = loadWorld(id);
    return Response.json({
      world: loaded.world,
      nodes: loaded.nodes,
      characters: loaded.characters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("world not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/worlds/[id]">,
) {
  const { id } = await ctx.params;
  const w = db
    .select({ id: schema.worlds.id })
    .from(schema.worlds)
    .where(eq(schema.worlds.id, id))
    .get();
  if (!w) {
    return Response.json({ error: `world not found: ${id}` }, { status: 404 });
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

  return Response.json({ ok: true, deleted: id });
}
