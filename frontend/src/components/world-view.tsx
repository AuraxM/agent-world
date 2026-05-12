"use client";

import { useEffect, useMemo, useState } from "react";
import { useWorldState } from "@/hooks/use-world-state";
import { useViewState } from "@/hooks/use-view-state";
import { useFollow } from "@/hooks/use-follow";
import { findRootNode } from "@/lib/world";
import { CharacterList } from "./character-list";
import { TickControl } from "./tick-control";
import { EventStream } from "./event-stream";
import { EventGantt } from "./event-gantt";
import { ProfilePane } from "./profile-pane";
import { StrangerChat } from "./stranger-chat";
import { WorldMap } from "./world-map";

export function WorldView() {
  const { snapshot, events, loadedSince, hasMore, loadingMore, loadMore, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto } = useWorldState();
  const view = useViewState();
  const { followingId, follow, isFollowing } = useFollow();
  const [centerTab, setCenterTab] = useState<"stream" | "gantt" | "chat" | "map">("stream");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!snapshot) return;
    setSelectedCharIds((prev) => {
      // Only initialize if empty (first load)
      if (prev.size === 0) {
        return new Set(snapshot.characters.map((c) => c.id));
      }
      // Add any new characters that appeared since last snapshot
      const next = new Set(prev);
      for (const c of snapshot.characters) {
        if (!next.has(c.id)) next.add(c.id);
      }
      return next;
    });
  }, [snapshot]);

  const onToggleChar = (id: string) => {
    setSelectedCharIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedCharacter = useMemo(() => {
    if (!snapshot || !profileId) return null;
    return snapshot.characters.find((c) => c.id === profileId) ?? null;
  }, [snapshot, profileId]);

  const handleSelectCharacter = (id: string) => {
    setProfileId((prev) => {
      if (prev === id) return null;
      view.selectCharacter(id);
      return id;
    });
  };

  useEffect(() => {
    if (!snapshot) return;
    const root = findRootNode(snapshot.nodes);
    if (root) view.initRootIfNeeded(root.id);
  }, [snapshot, view]);

  if (!snapshot) {
    return (
      <div className="h-full flex items-center justify-center text-(--text-on-frame-muted) text-body-lg">
        {error ? `加载失败：${error}` : loading ? "加载中…" : "无数据"}
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden animate-fade-in">
      {/* Left column */}
      <div className="w-[260px] flex-shrink-0 flex flex-col border-r border-white/10 bg-black/80 backdrop-blur-md">
        <CharacterList
          characters={snapshot.characters}
          selectedId={profileId ?? undefined}
          onSelect={handleSelectCharacter}
        />
        <TickControl
          tick={snapshot.world.currentTick}
          epoch={snapshot.world.epoch}
          loading={loading}
          onAdvance={advance}
          autoMode={autoMode}
          onStartAuto={startAuto}
          onStopAuto={stopAuto}
          lastTickMs={lastTickMs}
          tickProgress={tickProgress}
        />
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 flex flex-col bg-black/25 backdrop-blur-md relative overflow-hidden">
        {/* Tab bar */}
        <div className="flex px-3 border-b border-white/10 bg-black/15 flex-shrink-0">
          {(["stream", "gantt", "chat", "map"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCenterTab(key)}
              className={`px-4 py-2.5 text-[11px] tracking-[0.1em] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
                centerTab === key
                  ? "text-(--accent-strong) border-(--accent-strong)"
                  : "text-white/35 border-transparent hover:text-white/60"
              }`}
            >
              {key === "stream" ? "事件流" : key === "gantt" ? "甘特图" : key === "chat" ? "对话" : "地图"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {centerTab === "stream" && (
            <EventStream
              events={events}
              characters={snapshot.characters}
              nodes={snapshot.nodes}
              followingId={followingId}
              epoch={snapshot.world.epoch}
              selectedCharIds={selectedCharIds}
              onToggleChar={onToggleChar}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onJumpToNode={view.setCurrentNode}
              onSelectCharacter={(c) => handleSelectCharacter(c.id)}
              onFollow={follow}
            />
          )}
          {centerTab === "gantt" && (
            <EventGantt
              events={events}
              characters={snapshot.characters}
              nodes={snapshot.nodes}
              epoch={snapshot.world.epoch}
              loadedSince={loadedSince}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onJumpToNode={view.setCurrentNode}
              onSelectCharacter={(c) => handleSelectCharacter(c.id)}
              onFollow={follow}
            />
          )}
          {centerTab === "chat" && (
            <StrangerChat
              worldId={snapshot.world.id}
              characters={snapshot.characters}
              loading={loading}
            />
          )}
          {centerTab === "map" && (
            <WorldMap
              nodes={snapshot.nodes}
              characters={snapshot.characters}
              onSelectCharacter={(c) => handleSelectCharacter(c.id)}
            />
          )}
        </div>

        {/* Backdrop — click to dismiss profile */}
        {profileId && (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setProfileId(null)}
          />
        )}

        {/* Profile slide-in overlay */}
        <div
          className={`absolute inset-y-0 right-0 w-[420px] bg-black/85 backdrop-blur-2xl border-l border-white/10 shadow-[-4px_0_24px_rgba(0,0,0,0.4)] transition-transform duration-[250ms] ease z-20 ${
            profileId ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <ProfilePane
            character={selectedCharacter}
            nodes={snapshot.nodes}
            onJumpToNode={view.setCurrentNode}
            characters={snapshot.characters}
            events={events}
            onFollow={follow}
            isFollowing={selectedCharacter ? isFollowing(selectedCharacter.id) : false}
            epoch={snapshot.world.epoch}
            currentTick={snapshot.world.currentTick}
          />
        </div>
      </div>
    </div>
  );
}
