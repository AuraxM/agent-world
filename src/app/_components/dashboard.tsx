"use client";

import { useEffect, useMemo } from "react";
import { useViewState } from "../_hooks/use-view-state";
import { useWorldState } from "../_hooks/use-world-state";
import { findRootNode } from "../_lib/world";
import { CharacterRail } from "./character-rail";
import { MapStage } from "./map-stage";
import { RightPanel } from "./right-panel";
import { TopBar } from "./top-bar";

export function Dashboard() {
  const { snapshot, events, loading, error, lastTickMs, advance } = useWorldState();
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
        error={error}
      />
      {!snapshot || !view.currentNodeId ? (
        <div className="flex-1 flex items-center justify-center text-(--color-pixel-muted) text-sm">
          {error ? `加载失败：${error}` : loading ? "加载中…" : "无数据"}
        </div>
      ) : (
        <main className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr_360px] grid-rows-[minmax(0,1fr)] gap-2 p-2 overflow-hidden">
          <div className="min-h-0 min-w-0 overflow-hidden">
            <CharacterRail
              characters={snapshot.characters}
              nodes={snapshot.nodes}
              selectedId={view.selectedCharacterId}
              onSelect={(c) => view.selectCharacter(c.id, c.locationId)}
            />
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
          <div className="min-h-0 min-w-0 overflow-hidden">
            <RightPanel
              events={events}
              characters={snapshot.characters}
              nodes={snapshot.nodes}
              selectedCharacter={selectedCharacter}
              onJumpToNode={view.setCurrentNode}
            />
          </div>
        </main>
      )}
    </div>
  );
}
