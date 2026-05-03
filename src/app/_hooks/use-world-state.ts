"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { WorldEvent, Action } from "@/domain/types";
import { TICKS_PER_HOUR } from "@/domain/enums";
import type { WorldSnapshot } from "../_lib/api";

/** 通过 ?world=<id> 切换世界；未指定时回退到默认演示世界。 */
const DEFAULT_WORLD_ID = "world-yu-no-tani";

interface DecisionEvent {
  characterId: string;
  characterName: string;
  action: Action;
}

interface DoneEvent {
  worldId: string;
  fromTick: number;
  toTick: number;
  eventCount: number;
}

interface ErrorEvent {
  error: string;
  status: number;
}

export interface UseWorldState {
  snapshot: WorldSnapshot | null;
  events: WorldEvent[];
  loading: boolean;
  error: string | null;
  lastTickMs: number | null;
  /** 最近一次 tick 中已完成的角色决策数 / 总角色数 */
  tickProgress: { done: number; total: number } | null;
  refresh: () => Promise<void>;
  advance: () => Promise<boolean>;
  autoMode: { running: boolean; total: number; done: number } | null;
  startAuto: (n?: number) => Promise<void>;
  stopAuto: () => void;
  templates: Array<{ id: string; name: string; avatar: string | null }>;
  placeCharacter: (characterId: string) => Promise<boolean>;
}

export function useWorldState(): UseWorldState {
  const searchParams = useSearchParams();
  const worldId = searchParams?.get("world") ?? DEFAULT_WORLD_ID;
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null);
  const [events, setEvents] = useState<WorldEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTickMs, setLastTickMs] = useState<number | null>(null);
  const [tickProgress, setTickProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [autoMode, setAutoMode] = useState<{
    running: boolean;
    total: number;
    done: number;
  } | null>(null);
  const shouldStopRef = useRef(false);
  const loadingRef = useRef(false);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  const autoRunningRef = useRef(false);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);

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
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    fetch("/api/configs/characters")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.characters)) {
          setTemplates(
            d.characters.map((c: { id: string; name: string; avatar?: string | null }) => ({
              id: c.id,
              name: c.name,
              avatar: c.avatar ?? null,
            })),
          );
        }
      })
      .catch(() => { /* 静默 */ });
  }, []);

  const advance = useCallback(async (): Promise<boolean> => {
    // 取消上一次还在进行中的请求
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLoading(true);
    setTickProgress(null);
    const t0 = performance.now();

    // 从 snapshot 获取总角色数
    const total = snapshot?.characters.length ?? 0;

    try {
      const res = await fetch(`/api/worlds/${worldId}/tick`, {
        method: "POST",
        cache: "no-store",
        signal: abort.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!res.ok) {
        // 非 SSE 错误响应
        let msg = `tick ${res.status}`;
        try {
          const body = await res.json();
          if (body.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("no response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let tickDone = false;

      // SSE parser duplicated by placeCharacter — keep both in sync.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件（简化：按 \n\n 分隔）
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let eventType = "";
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              dataStr = line.slice(6);
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventType === "decision") {
              const dec = data as DecisionEvent;
              // 乐观更新：把角色的新 action 写入 snapshot
              setSnapshot((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  characters: prev.characters.map((ch) =>
                    ch.id === dec.characterId
                      ? { ...ch, lastThought: { action: dec.action, tick: prev.world.currentTick } as unknown as typeof ch.lastThought }
                      : ch,
                  ),
                };
              });
              setTickProgress((prev) => ({
                done: (prev?.done ?? 0) + 1,
                total: prev?.total ?? total,
              }));
            } else if (eventType === "done") {
              tickDone = true;
              setLastTickMs(performance.now() - t0);
              setTickProgress(null);
            } else if (eventType === "error") {
              const err = data as ErrorEvent;
              throw new Error(err.error);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "unexpected event") {
              throw e;
            }
          }
        }
      }

      if (tickDone) {
        // 用服务端权威数据做一次全量刷新
        await refresh();
      }
      return tickDone;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
      setTickProgress(null);
      return false;
    }
  }, [refresh, worldId, snapshot?.characters.length]);

  const startAuto = useCallback(
    async (n: number = 24 * TICKS_PER_HOUR) => {
      if (loadingRef.current || autoRunningRef.current) return;
      autoRunningRef.current = true;
      shouldStopRef.current = false;
      setAutoMode({ running: true, total: n, done: 0 });
      try {
        for (let i = 0; i < n; i++) {
          if (shouldStopRef.current) break;
          const ok = await advance();
          if (!ok) break;
          setAutoMode((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
        }
      } finally {
        autoRunningRef.current = false;
        shouldStopRef.current = false;
        setAutoMode(null);
      }
    },
    [advance],
  );

  const stopAuto = useCallback(() => {
    shouldStopRef.current = true;
  }, []);

  const placeCharacter = useCallback(
    async (characterId: string): Promise<boolean> => {
      if (loadingRef.current || autoRunningRef.current) return false;
      setLoading(true);
      try {
        const res = await fetch(`/api/worlds/${worldId}/characters/place`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ characterId }),
        });
        if (!res.ok) {
          let msg = `place ${res.status}`;
          try {
            const body = await res.json();
            if (body.error) msg = body.error;
          } catch { /* ignore */ }
          throw new Error(msg);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no response body");
        const decoder = new TextDecoder();
        let buffer = "";
        let placed = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const lines = part.split("\n");
            let eventType = "";
            let dataStr = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              else if (line.startsWith("data: ")) dataStr = line.slice(6);
            }
            if (!dataStr) continue;
            const data = JSON.parse(dataStr);
            if (eventType === "placed") {
              placed = true;
            } else if (eventType === "error") {
              throw new Error(data.error ?? "unknown");
            }
          }
        }
        await refresh();
        return placed;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [worldId, refresh],
  );

  return {
    snapshot,
    events,
    loading,
    error,
    lastTickMs,
    tickProgress,
    refresh,
    advance,
    autoMode,
    startAuto,
    stopAuto,
    templates,
    placeCharacter,
  };
}
