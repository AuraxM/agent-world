import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  listMapPackIds,
  validateMapPack,
} from "@/config/loader";

export async function GET() {
  try {
    const packIds = listMapPackIds();
    const packs = packIds.map((id) => validateMapPack(id));

    const worlds = db
      .select()
      .from(schema.worlds)
      .orderBy(desc(schema.worlds.updatedAt))
      .limit(1)
      .all();

    let activeWorld: {
      id: string;
      mapId: string;
      name: string;
      currentTick: number;
      characterCount: number;
    } | null = null;

    if (worlds.length > 0) {
      const w = worlds[0];
      const chars = db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.worldId, w.id))
        .all();

      activeWorld = {
        id: w.id,
        mapId: w.mapId,
        name: w.name,
        currentTick: w.currentTick,
        characterCount: chars.length,
      };
    }

    return Response.json({ packs, activeWorld });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
