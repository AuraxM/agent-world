/**
 * POST /api/worlds/:id/characters
 * 在已有世界中投放一名新角色（默认落点 = 该世界首个 entry 节点）。
 *
 * Body: { characterId, entryNodeId?, vitals? }
 */
import { z } from "zod";
import { addCharacterToWorld } from "@/engine/addCharacter";

const BodySchema = z.object({
  characterId: z.string().min(1),
  entryNodeId: z.string().min(1).optional(),
  vitals: z
    .object({
      hunger: z.number().int().nonnegative().optional(),
      fatigue: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/worlds/[id]/characters">,
) {
  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid body",
        issues: parsed.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = addCharacterToWorld({
      worldId: id,
      characterId: parsed.data.characterId,
      entryNodeId: parsed.data.entryNodeId,
      vitals: parsed.data.vitals,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("world not found") ||
        message.startsWith("character template not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("character already in world") ||
        message.startsWith("entry node not in world") ||
        message.startsWith("world has no entry node")) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
