"use client";

import { useEffect, useMemo } from "react";
import { useViewState } from "../_hooks/use-view-state";
import { useWorldState } from "../_hooks/use-world-state";
import { findRootNode } from "../_lib/world";
import { CharacterRail } from "./character-rail";
import { EventsPane } from "./events-pane";
import { MapStage } from "./map-stage";
import { PixelFrame } from "./pixel-frame";
import { ProfilePane } from "./profile-pane";
import { TopBar } from "./top-bar";

export function Dashboard() {
  const { snapshot, events, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto } = useWorldState();
  const view = useViewState();

  // 第一次 snapshot 到位时初始化 currentNode 为根节点
  useEffect(() => {
    if (!snapshot) return;
    const root = findRootNode(snapshot.nodes);
    if (root) view.initRootIfNeeded(root.id);
  }, [snapshot, view]);

  const selectedCharacter = useMemo(() => {
    if (!snapshot || !view.selectedCharacterId) return null;
    return snapshot.characters.find((c) => c.id === view.selectedCharacterId) ?? null;
  }, [snapshot, view.selectedCharacterId]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopBar
        tick={snapshot?.world.currentTick ?? 0}
        worldName={snapshot?.world.name ?? "加载中…"}
        loading={loading}
        onAdvance={() => void advance()}
        lastTickMs={lastTickMs}
        tickProgress={tickProgress}
        error={error}
        autoMode={autoMode}
        onStartAuto={() => void startAuto()}
        onStopAuto={stopAuto}
      />
      {!snapshot || !view.currentNodeId ? (
        <div className="flex-1 flex items-center justify-center text-(--color-pixel-muted) text-game-lg">
          {error ? `加载失败：${error}` : loading ? "加载中…" : "无数据"}
        </div>
      ) : (
        <main className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[480px_1fr_360px] grid-rows-[minmax(0,1fr)] gap-2 p-2 overflow-hidden">
          {/* 左列：角色列表 + 角色档案 */}
          <div className="min-h-0 min-w-0 overflow-hidden flex flex-col gap-2">
            <div className="flex-[0_0_45%] min-h-0 overflow-hidden">
              <CharacterRail
                characters={snapshot.characters}
                nodes={snapshot.nodes}
                selectedId={view.selectedCharacterId}
                onSelect={(c) => view.selectCharacter(c.id, c.locationId)}
              />
            </div>
            <PixelFrame
              title="角色档案"
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              <ProfilePane
                character={selectedCharacter}
                nodes={snapshot.nodes}
                onJumpToNode={view.setCurrentNode}
                characters={snapshot.characters}
              />
            </PixelFrame>
          </div>
          <div className="min-h-0 min-w-0 overflow-hidden">
            <MapStage
              nodes={snapshot.nodes}
              characters={snapshot.characters}
              currentNodeId={view.currentNodeId}
              selectedCharacterId={view.selectedCharacterId}
              onEnterNode={view.setCurrentNode}
              onSelectCharacter={(c) => view.selectCharacter(c.id)}
            />
          </div>
          {/* 右列：事件流 */}
          <div className="min-h-0 min-w-0 overflow-hidden">
            <PixelFrame
              title="事件流（新→旧）"
              className="flex flex-col h-full min-h-0 overflow-hidden"
            >
              <EventsPane events={events} characters={snapshot.characters} />
            </PixelFrame>
          </div>
        </main>
      )}
    </div>
  );
}
