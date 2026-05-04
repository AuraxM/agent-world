"use client";

import { useState } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { characterEmoji } from "../_lib/sprite";
import { childrenOf, indexNodes } from "../_lib/world";

interface Template {
  id: string;
  name: string;
  avatar: string | null;
}

export function TreeSidebar({
  nodes,
  characters,
  currentNodeId,
  events,
  selectedCharacterId,
  followingId,
  onJumpToNode,
  onSelectCharacter,
  templates,
  onPlace,
  disabled,
}: {
  nodes: MapNode[];
  characters: Character[];
  currentNodeId: string;
  events: WorldEvent[];
  selectedCharacterId: string | null;
  followingId: string | null;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  templates: Template[];
  onPlace: (characterId: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const nodeById = indexNodes(nodes);
  const root = nodes.find((n) => n.parentId === null);

  // Pulse: nodes with events >= intensity 3 at that node
  const pulsingNodes = new Set<string>();
  for (const ev of events) {
    if (ev.intensity >= 3 && ev.nodeId) pulsingNodes.add(ev.nodeId);
  }

  if (collapsed) {
    return (
      <div
        className="h-full flex flex-col items-center pt-3 bg-(--frame-2) border-r-2 border-(--border) shadow-[inset_-1px_0_0_var(--border-amber))]"
        style={{ width: 36 }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-pixel-xs text-(--text-on-frame-muted) hover:text-(--text-on-frame) cursor-pointer"
          title="展开地图树"
        >
          ▶
        </button>
        <span
          className="mt-2 text-pixel-xs text-(--text-on-frame-faint) tracking-[var(--letter-pixel)]"
          style={{ writingMode: "vertical-rl" }}
        >
          地图层级
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-(--frame-2) border-r-2 border-(--border) shadow-[inset_-1px_0_0_var(--border-amber))] overflow-hidden">
      {/* Collapse button */}
      <div className="flex justify-end px-2 pt-2">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="px-1.5 py-0.5 text-pixel-xs bg-(--chrome) text-(--text-on-frame-muted) border border-(--border-amber) cursor-pointer hover:text-(--text-on-frame)"
          title="折叠地图树"
        >
          ◀
        </button>
      </div>

      {/* Map hierarchy */}
      <div className="text-pixel-xs text-(--text-on-frame-faint) tracking-[var(--letter-pixel)] uppercase px-3 pt-2 pb-1 border-b border-(--border)">
        地图层级
      </div>
      <div className="overflow-y-auto pixel-scroll flex-shrink">
        {root && (
          <TreeItem
            node={root}
            nodeById={nodeById}
            childrenOf={childrenOf}
            currentNodeId={currentNodeId}
            pulsingNodes={pulsingNodes}
            onJumpToNode={onJumpToNode}
            depth={0}
          />
        )}
      </div>

      {/* Active NPCs */}
      <div className="text-pixel-xs text-(--text-on-frame-faint) tracking-[var(--letter-pixel)] uppercase px-3 pt-3 pb-1 border-b border-t border-(--border)">
        活跃 NPC
      </div>
      <div className="flex-1 overflow-y-auto pixel-scroll">
        {characters.map((c) => {
          const selected = c.id === selectedCharacterId;
          const followed = c.id === followingId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectCharacter(c)}
              className={`w-full text-left px-3 py-1.5 text-body-xs flex items-center gap-2 cursor-pointer transition-colors ${
                selected
                  ? "bg-(--border-amber) text-(--panel)"
                  : "text-(--text-on-frame-muted) hover:bg-(--border-amber)/20"
              }`}
            >
              <span className="text-sm">
                {characterEmoji(c)}
              </span>
              <span className="flex-1 truncate">{c.name}</span>
              {followed && <span className="text-pixel-xs text-(--accent-strong)">👁</span>}
            </button>
          );
        })}
        <div className="px-3 py-1.5 text-body-xs text-(--text-on-frame-faint) opacity-50">
          共 {characters.length} 人
        </div>
      </div>

      {/* Place character button */}
      {templates.length > 0 && (
        <div className="p-2 border-t border-(--border)">
          <button
            type="button"
            disabled={disabled}
            className="w-full py-1 text-pixel-xs text-(--text-on-frame-muted) border border-(--border-amber) bg-(--frame) cursor-pointer hover:text-(--text-on-frame) disabled:opacity-40"
            title="从模板中投放角色到当前节点"
          >
            + 投放角色
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- recursive tree item ---- */

function TreeItem({
  node,
  nodeById,
  childrenOf,
  currentNodeId,
  pulsingNodes,
  onJumpToNode,
  depth,
}: {
  node: MapNode;
  nodeById: Map<string, MapNode>;
  childrenOf: (nodes: MapNode[], parentId: string | null) => MapNode[];
  currentNodeId: string;
  pulsingNodes: Set<string>;
  onJumpToNode: (id: string) => void;
  depth: number;
}) {
  const active = node.id === currentNodeId;
  const hasPulse = pulsingNodes.has(node.id);
  const kids = childrenOf(
    Array.from(nodeById.values()),
    node.id,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => onJumpToNode(node.id)}
        className={`w-full text-left px-3 py-1.5 text-body-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
          active
            ? "bg-(--border-amber) text-(--panel)"
            : "text-(--text-on-frame-muted) hover:bg-(--border-amber)/20"
        }`}
      >
        <span className="opacity-50 text-pixel-xs">
          {"　".repeat(depth)}
        </span>
        <span className="text-pixel-xs text-(--text-on-frame-faint)">
          {kids.length > 0 ? "▾" : "▸"}
        </span>
        <span className="flex-1 truncate">{node.name}</span>
        {hasPulse && (
          <span className="text-(--danger) text-pixel-xs">●</span>
        )}
      </button>
      {active &&
        kids.map((kid) => (
          <TreeItem
            key={kid.id}
            node={kid}
            nodeById={nodeById}
            childrenOf={childrenOf}
            currentNodeId={currentNodeId}
            pulsingNodes={pulsingNodes}
            onJumpToNode={onJumpToNode}
            depth={depth + 1}
          />
        ))}
    </>
  );
}
