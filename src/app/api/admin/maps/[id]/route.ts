/**
 * GET /api/admin/maps/[id] — 获取地图完整配置（含节点树与入口节点）
 */
import { loadMap } from "@/config/loader";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const map = loadMap(id);
    const entryNodeId = map.nodes.find((n) => n.isEntry)?.id ?? null;
    return Response.json({
      map: {
        ...map,
        entryNodeId,
        nodeCount: map.nodes.length,
        // 构建树结构供前端展示
        rootNodes: map.nodes.filter((n) => n.parentId === null).map((n) => n.id),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("map not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
