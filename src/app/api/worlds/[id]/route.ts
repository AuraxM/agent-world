/**
 * GET /api/worlds/:id
 * 返回当前世界的完整快照：world meta + nodes + characters。
 */
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
