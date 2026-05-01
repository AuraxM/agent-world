/**
 * GET /api/worlds/:id/events?since=tick
 * 返回 since（含）之后的事件日志，倒序（新事件在前）。
 * since 缺省 = 0。
 */
import type { NextRequest } from "next/server";
import { loadEventsSince } from "@/engine/store";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/worlds/[id]/events">,
) {
  const { id } = await ctx.params;
  const sinceParam = request.nextUrl.searchParams.get("since");
  const since = sinceParam ? Number.parseInt(sinceParam, 10) : 0;
  if (Number.isNaN(since) || since < 0) {
    return Response.json(
      { error: "invalid `since` query param" },
      { status: 400 },
    );
  }
  try {
    const events = loadEventsSince(id, since);
    return Response.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
