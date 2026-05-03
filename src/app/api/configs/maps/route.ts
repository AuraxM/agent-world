/**
 * GET /api/configs/maps
 * 列出 configs/maps 下所有可用地图（含节点数与 entry 节点 id）。
 */
import { loadAllMaps, loadManifest } from "@/config/loader";

export async function GET() {
  try {
    const maps = loadAllMaps().map((m) => {
      let name = m.id;
      let description = "";
      try {
        const manifest = loadManifest(m.id);
        name = manifest.name;
        description = manifest.description ?? "";
      } catch { /* manifest failed, use id as name */ }
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
    return Response.json({ maps });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
