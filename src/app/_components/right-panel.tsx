"use client";

import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { EventsPane } from "./events-pane";
import { PixelFrame } from "./pixel-frame";
import { ProfilePane } from "./profile-pane";

export function RightPanel({
  events,
  characters,
  nodes,
  selectedCharacter,
  onJumpToNode,
}: {
  events: WorldEvent[];
  characters: Character[];
  nodes: MapNode[];
  selectedCharacter: Character | null;
  onJumpToNode: (nodeId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0 overflow-hidden">
      <PixelFrame
        title="事件流（新→旧）"
        className="flex flex-col flex-1 min-h-0 basis-[60%] overflow-hidden"
      >
        <EventsPane events={events} characters={characters} />
      </PixelFrame>
      <PixelFrame
        title="角色档案"
        className="flex flex-col flex-1 min-h-0 basis-[40%] overflow-hidden"
      >
        <ProfilePane
          character={selectedCharacter}
          nodes={nodes}
          onJumpToNode={onJumpToNode}
          characters={characters}
        />
      </PixelFrame>
    </div>
  );
}
