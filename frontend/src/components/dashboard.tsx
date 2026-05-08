"use client";

import { useEffect, useMemo, useState } from "react";
import { useViewState } from "@/hooks/use-view-state";
import { useWorldState } from "@/hooks/use-world-state";
import { useFollow } from "@/hooks/use-follow";
import { findRootNode } from "@/lib/world";
import { TopBar } from "./top-bar";
import { TickBar } from "./tick-bar";
import { MapStage } from "./map-stage";
import { RelationGraph } from "./relation-graph";
import { TreeSidebar } from "./tree-sidebar";
import { ProfilePane } from "./profile-pane";
import { EventStream } from "./event-stream";
import { EventGantt } from "./event-gantt";
import { InjectDrawer } from "./inject-drawer";

export function Dashboard() {
  const { snapshot, events, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto, templates, placeCharacter } = useWorldState();
  const view = useViewState();
  const { followingId, follow, clear: clearFollow, isFollowing } = useFollow();
  const [injectOpen, setInjectOpen] = useState(false);
  const [centerTab, setCenterTab] = useState<"stream" | "map" | "gantt" | "relations">("stream");

  useEffect(() => {
    if (!snapshot) return;
    const root = findRootNode(snapshot.nodes);
    if (root) view.initRootIfNeeded(root.id);
  }, [snapshot, view]);

  const selectedCharacter = useMemo(() => {
    if (!snapshot || !view.selectedCharacterId) return null;
    return snapshot.characters.find((c) => c.id === view.selectedCharacterId) ?? null;
  }, [snapshot, view.selectedCharacterId]);

  const followingCharacter = useMemo(() => {
    if (!snapshot || !followingId) return null;
    return snapshot.characters.find((c) => c.id === followingId) ?? null;
  }, [snapshot, followingId]);

  // keyboard shortcut for inject drawer
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "E" || e.key === "e") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setInjectOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopBar
        tick={snapshot?.world.currentTick ?? 0}
        epoch={snapshot?.world.epoch ?? 0}
        worldName={snapshot?.world.name ?? "加载中…"}
        currentNodeId={view.currentNodeId}
        nodes={snapshot?.nodes ?? []}
        followingName={followingCharacter?.name ?? null}
        onJumpToNode={view.setCurrentNode}
        onClearFollow={clearFollow}
      />

      {!snapshot || !view.currentNodeId ? (
        <div className="flex-1 flex items-center justify-center text-(--text-on-frame-muted) text-body-lg">
          {error ? `加载失败：${error}` : loading ? "加载中…" : "无数据"}
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 grid gap-0 overflow-hidden"
          style={{
            gridTemplateColumns: "200px 1fr 360px",
            gridTemplateRows: "1fr 56px",
            gridTemplateAreas: `
              "tree stream right"
              "bottom bottom bottom"
            `,
            minWidth: 1200,
          }}
        >
          {/* Left: Tree sidebar */}
          <div style={{ gridArea: "tree" }} className="min-h-0 min-w-0 overflow-hidden">
            <TreeSidebar
              nodes={snapshot.nodes}
              characters={snapshot.characters}
              currentNodeId={view.currentNodeId}
              events={events}
              selectedCharacterId={view.selectedCharacterId}
              followingId={followingId}
              onJumpToNode={view.setCurrentNode}
              onSelectCharacter={(c) => view.selectCharacter(c.id)}
              templates={templates}
              onPlace={placeCharacter}
              disabled={loading || (autoMode?.running ?? false)}
            />
          </div>

          {/* Center: stage tabs (事件流 / 小地图 / 关系图) */}
          <div style={{ gridArea: "stream" }} className="min-h-0 min-w-0 overflow-hidden flex flex-col">
            {/* Tab bar */}
            <div className="flex px-2 bg-(--frame-2) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
              {([
                ["stream", "事件流"],
                ["map", "小地图"],
                ["gantt", "甘特图"],
                ["relations", "关系图"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCenterTab(key)}
                  className={`text-pixel-xs px-3 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
                    centerTab === key
                      ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
                      : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
                  }`}
                >
                  {label}
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
                  onJumpToNode={view.setCurrentNode}
                  onSelectCharacter={(c) => view.selectCharacter(c.id)}
                  onFollow={follow}
                />
              )}
              {centerTab === "map" && (
                <MapStage
                  nodes={snapshot.nodes}
                  characters={snapshot.characters}
                  currentNodeId={view.currentNodeId}
                  selectedCharacterId={view.selectedCharacterId}
                  onEnterNode={view.setCurrentNode}
                  onSelectCharacter={(c) => view.selectCharacter(c.id)}
                />
              )}
              {centerTab === "gantt" && (
                <EventGantt
                  events={events}
                  characters={snapshot.characters}
                  nodes={snapshot.nodes}
                  epoch={snapshot.world.epoch}
                  onJumpToNode={view.setCurrentNode}
                  onSelectCharacter={(c) => view.selectCharacter(c.id)}
                  onFollow={follow}
                />
              )}
              {centerTab === "relations" && (
                <RelationGraph
                  characters={snapshot.characters}
                  selectedCharacterId={view.selectedCharacterId}
                  nodes={snapshot.nodes}
                  onSelectCharacter={(id) => view.selectCharacter(id)}
                />
              )}
            </div>
          </div>

          {/* Right: character profile */}
          <div style={{ gridArea: "right" }} className="min-h-0 min-w-0 overflow-hidden flex flex-col bg-(--frame-2) border-l-2 border-(--border)">
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

          {/* Bottom: Tick bar */}
          <div style={{ gridArea: "bottom" }}>
            <TickBar
              tick={snapshot.world.currentTick}
              epoch={snapshot.world.epoch}
              loading={loading}
              onAdvance={() => void advance()}
              autoMode={autoMode}
              onStartAuto={(n) => void startAuto(n)}
              onStopAuto={stopAuto}
              lastTickMs={lastTickMs}
              tickProgress={tickProgress}
              onOpenInject={() => setInjectOpen(true)}
            />
          </div>
        </div>
      )}

      <InjectDrawer isOpen={injectOpen} onClose={() => setInjectOpen(false)} />
    </div>
  );
}
