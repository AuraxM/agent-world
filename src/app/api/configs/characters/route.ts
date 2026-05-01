/**
 * GET /api/configs/characters
 * 列出 configs/characters 下所有角色模板（用于"开始游戏"选 cast）。
 */
import { loadAllCharacters } from "@/config/loader";

export async function GET() {
  try {
    const characters = loadAllCharacters().map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar ?? null,
      personality: c.personality,
      relationCount: Object.keys(c.relations).length,
    }));
    return Response.json({ characters });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
