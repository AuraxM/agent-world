/**
 * POST /api/worlds/:id/tick
 * 推进一个 game-hour：触发引擎、并发 LLM 决策、SSE 流式推送结果。
 */
import { tick } from "@/engine/tick";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/worlds/[id]/tick">,
) {
  const { id } = await ctx.params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      }

      try {
        const result = await tick(id, {
          onCharacterDecision: (data) => {
            send("decision", data);
          },
        });
        send("done", {
          worldId: result.worldId,
          fromTick: result.fromTick,
          toTick: result.toTick,
          eventCount: result.events.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("world not found")) {
          send("error", { error: message, status: 404 });
        } else {
          send("error", { error: message, status: 500 });
        }
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
