/**
 * GET /api/worlds/:id/characters/:cid
 * 返回单个角色的完整档案：character + 所在节点 + 上一轮思考 (lastThought)。
 * lastThought 已在 loadWorld 中注入，无需额外查询。
 */
import { loadWorld } from "@/engine/store";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/worlds/[id]/characters/[cid]">,
) {
  const { id, cid } = await ctx.params;
  try {
    const loaded = loadWorld(id);
    const character = loaded.characters.find((c) => c.id === cid);
    if (!character) {
      return Response.json(
        { error: `character not found: ${cid}` },
        { status: 404 },
      );
    }
    const here = loaded.nodes.find((n) => n.id === character.locationId) ?? null;
    return Response.json({ character, here });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("world not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
