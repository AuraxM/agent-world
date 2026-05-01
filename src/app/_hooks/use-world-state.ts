"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { WorldEvent } from "@/domain/types";
import type { WorldSnapshot } from "../_lib/api";

/** 通过 ?world=<id> 切换世界；未指定时回退到默认演示世界。 */
const DEFAULT_WORLD_ID = "world-morning-town";

export interface UseWorldState {
  snapshot: WorldSnapshot | null;
  events: WorldEvent[];
  loading: boolean;
  error: string | null;
  lastTickMs: number | null;
  refresh: () => Promise<void>;
  advance: () => Promise<void>;
}

export function useWorldState(): UseWorldState {
  const searchParams = useSearchParams();
  const worldId = searchParams?.get("world") ?? DEFAULT_WORLD_ID;
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTickMs, setLastTickMs] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [snapRes, evRes] = await Promise.all([
        fetch(`/api/worlds/${worldId}`, { cache: "no-store" }),
        fetch(`/api/worlds/${worldId}/events?since=0`, { cache: "no-store" }),
      ]);
      if (!snapRes.ok) throw new Error(`snapshot ${snapRes.status}`);
      if (!evRes.ok) throw new Error(`events ${evRes.status}`);
      const snap = (await snapRes.json()) as WorldSnapshot;
      const ev = (await evRes.json()) as { events: WorldEvent[] };
      setSnapshot(snap);
      setEvents(ev.events);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  useEffect(() => {
    // 微任务延迟到 effect 提交后再触发首次拉取，避免同步 setState in effect 警告
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const advance = useCallback(async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      const res = await fetch(`/api/worlds/${worldId}/tick`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`tick ${res.status}`);
      setLastTickMs(performance.now() - t0);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [refresh, worldId]);

  return { snapshot, events, loading, error, lastTickMs, refresh, advance };
}
