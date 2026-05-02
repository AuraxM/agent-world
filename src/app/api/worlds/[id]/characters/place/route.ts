/**
 * POST /api/worlds/:id/characters/place
 * 把一个未在世界中的角色投放到地图入口节点，并立即跑一次它的 LLM 决策
 * （prompt 强制 arrivalIntro=true，让 LLM 编造它来到此地的理由）。
 *
 * SSE：
 *   event: placed     data: { characterId, entryNodeId }
 *   event: decision   data: { characterId, characterName, action }
 *   event: done       data: { characterId, tick }
 *   event: error      data: { error, status }
 */
import { z } from "zod";
import { addCharacterToWorld } from "@/engine/addCharacter";
import { decideForCharacter } from "@/engine/decideForCharacter";
import { loadWorld } from "@/engine/store";

export const maxDuration = 120;

const BodySchema = z.object({
  characterId: z.string().min(1),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/worlds/[id]/characters/place">,
) {
  const { id: worldId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body: characterId required" },
      { status: 400 },
    );
  }
  const { characterId } = parsed.data;

  // 在 SSE 启动前先做同步可恢复错误检查（add 阶段）
  let entryNodeId: string;
  let name: string;
  try {
    const r = addCharacterToWorld({ worldId, characterId });
    entryNodeId = r.entryNodeId;
    name = r.name;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.startsWith("world not found") ||
      message.startsWith("character template not found")
    ) {
      return Response.json({ error: message }, { status: 404 });
    }
    if (
      message.startsWith("character already in world") ||
      message.startsWith("entry node not in world") ||
      message.startsWith("world has no entry node")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }

  // 单次读取以拿到 currentTick（decideForCharacter 不会推进 tick）
  const { world } = loadWorld(worldId);
  const tickBefore = world.currentTick;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        send("placed", { characterId, entryNodeId });

        const result = await decideForCharacter(worldId, characterId);
        send("decision", {
          characterId,
          characterName: name,
          action: result.action,
        });
        send("done", {
          characterId,
          tick: tickBefore,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { error: message, status: 500 });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
