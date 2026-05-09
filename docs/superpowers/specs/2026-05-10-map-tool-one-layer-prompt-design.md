# Map Tool & One-Layer Prompt Design

**Date**: 2026-05-10

## Problem

The full map graph is injected into the system prompt via `describeMapGraph()`. This is:
- Wasteful for context: most nodes are irrelevant to the current decision
- Missing from dialog/think prompts: LLM doesn't know legal `target_node_id` values
- Missing a query mechanism: LLM can't explore beyond what's in the prompt

## Solution

Two complementary changes:

### 1. One-layer local map in decide/chat/think prompts

Replace the lone `当前位置：${here.name}` line in user/dialog/think prompts with a local map view showing:
- Current node (name, id, tags, description)
- Parent node (if any)
- Children nodes

All nodes include `[id]` for `target_node_id` reuse. No siblings, no shortcuts in this view.

New helper: `describeLocalMap(here, allNodes)` in `prompt.ts`.

### 2. `view_map` tool

A tool callable in decide, dialog, and think contexts. Returns the full map tree **re-rooted** with the current node as root.

**Re-rooting algorithm**:
- Convert parent/child relationships into an undirected adjacency graph
- BFS from current node, building a new tree
- Output uses the same indent format as `describeMapGraph()`

**Example**: Config `A->B, A->C, C->D`, current at `C`:
```
- C [C]（...）
  - A [A]（...）
    - B [B]（...）
  - D [D]（...）
```

**Tool spec**:
- Name: `view_map`
- Parameters: none (uses character's current location)
- Does NOT consume a turn round (like recall/memorize)

**Integration**: Added to tools array + handler in:
- `callLLMWithRetry` (decide)
- `llmDialogTurn` (dialog)
- `llmThink` (think)

## Files Changed

| File | Change |
|---|---|
| `backend/src/llm/prompt.ts` | Add `describeLocalMap()`, `buildMapView()`, `buildMapTool()`; update 3 prompt builders |
| `backend/src/domain/schemas.ts` | Add `VIEW_MAP_TOOL_NAME`, `ViewMapSchema`, `ViewMapToolSchema` |
| `backend/src/llm/decide.ts` | Add `view_map` tool + handler in decide/dialog/think loops |
