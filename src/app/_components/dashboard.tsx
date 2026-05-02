"use client";

import { useEffect, useMemo, useState } from "react";
import { useViewState } from "../_hooks/use-view-state";
import { useWorldState } from "../_hooks/use-world-state";
import { useFollow } from "../_hooks/use-follow";
import { findRootNode } from "../_lib/world";
import { TopBar } from "./top-bar";
import { TickBar } from "./tick-bar";
import { MapStage, MinimapTabs } from "./map-stage";
import { RelationGraph } from "./relation-graph";
import { TreeSidebar } from "./tree-sidebar";
import { ProfilePane } from "./profile-pane";

export function Dashboard() {
  const { snapshot, events, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto, templates, placeCharacter } = useWorldState();
  const view = useViewState();
  const { followingId, follow, clear: clearFollow, isFollowing } = useFollow();
  const [injectOpen, setInjectOpen] = useState(false);

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

          {/* Center: Event stream (placeholder — Task 11) */}
          <div style={{ gridArea: "stream" }} className="min-h-0 min-w-0 overflow-hidden bg-(--frame)">
            <div className="flex items-center justify-center h-full text-body-sm text-(--text-on-frame-muted)">
              {/* TODO: EventStream (Task 11) */}
              事件流主体 (Task 11)
            </div>
          </div>

          {/* Right: minimap + character profile (placeholder — Tasks 12-13) */}
          <div style={{ gridArea: "right" }} className="min-h-0 min-w-0 overflow-hidden flex flex-col bg-(--frame-2) border-l-2 border-(--border)">
            <MinimapTabs>
              <MapStage
                nodes={snapshot.nodes}
                characters={snapshot.characters}
                currentNodeId={view.currentNodeId}
                selectedCharacterId={view.selectedCharacterId}
                onEnterNode={view.setCurrentNode}
                onSelectCharacter={(c) => view.selectCharacter(c.id)}
              />
              <RelationGraph />
            </MinimapTabs>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ProfilePane
                character={selectedCharacter}
                nodes={snapshot.nodes}
                onJumpToNode={view.setCurrentNode}
                characters={snapshot.characters}
                events={events}
                onFollow={follow}
                isFollowing={selectedCharacter ? isFollowing(selectedCharacter.id) : false}
              />
            </div>
          </div>

          {/* Bottom: Tick bar */}
          <div style={{ gridArea: "bottom" }}>
            <TickBar
              tick={snapshot.world.currentTick}
              loading={loading}
              onAdvance={() => void advance()}
              autoMode={autoMode}
              onStartAuto={() => void startAuto()}
              onStopAuto={stopAuto}
              lastTickMs={lastTickMs}
              tickProgress={tickProgress}
              onOpenInject={() => setInjectOpen(true)}
            />
          </div>
        </div>
      )}

      {/* Inject drawer placeholder (Task 14) */}
      {injectOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setInjectOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-[420px] z-50 bg-(--panel) border-l-2 border-(--border) flex items-center justify-center text-body-sm text-(--text-muted)">
            投放事件 (Task 14)
            <button onClick={() => setInjectOpen(false)} className="absolute top-3 right-3 cursor-pointer">✕</button>
          </div>
        </>
      )}
    </div>
  );
}
