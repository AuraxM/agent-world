/**
 * POST /api/worlds/:id/tick
 * 推进一个 game-hour：触发引擎、并行 LLM 决策、写日志、返回 TickResult。
 *
 * maxDuration=60s 给 5 NPC 并发 LLM 调用留余量（DeepSeek v4-flash
 * 关 thinking 后单次约 1-3s，并发 5 + 写盘开销，60s 足够）。
 */
import { tick } from "@/engine/tick";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/worlds/[id]/tick">,
) {
  const { id } = await ctx.params;
  try {
    const result = await tick(id);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("world not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
