# Pathfinding Movement Design

## Motivation

NPC movement is currently LLM-driven step-by-step: each tick the LLM picks an adjacent node to move to. This causes NPCs to oscillate between nodes, exhaust movement quota without reaching objectives, and produces unpredictable tick costs. The LLM should decide the destination and purpose, while pathfinding is a deterministic engine concern.

## Changes

### 1. Tick granularity: 1 hour = 5 ticks

- `TICKS_PER_HOUR = 5`
- Config and domain remain in natural time (hours, 24h). Engine converts: `hoursToTicks(h) = h * TICKS_PER_HOUR`
- All duration configs (sleepWindow, etc.) are authored in hours and multiplied at load time
- Vitals and emotion drift are distributed across ticks proportionally

### 2. move action is destination-driven

LLM `submit_action` schema for `move` gains new parameters:

```
move {
  targetNodeId: string      // destination — any node in the map, not limited to adjacent
  reason: string            // why the NPC is going there (stored in memory)
  arrivalAction: {
    type: ActionType        // action to auto-execute upon arrival
    freeText?: string       // for speak: what to say
    targetId?: string       // interaction target characterId
    targetNodeId?: string   // interaction target nodeId
  }
}
```

### 3. BFS shortest path

- New module `src/engine/pathfinding.ts` — pure function, no external dependencies
- `findPath(from, to, adjacency): string[] | null`
- Adjacency built once per tick from the tree + shortcuts structure (parent, children, shortcut targets)
- Uniform cost per step = 1 tick. `travelCost` field on MapNode is ignored for path computation
- Returns node ID sequence including start and end; hop count = `path.length - 1`
- If unreachable, move is rejected with a `wait` fallback

### 4. Movement execution

When `currentAction.type === "move"`:

- Each tick: `stepIndex++`, position updates to `path[stepIndex]`
- NPC is locked — no LLM decision until arrival or interruption
- Can be interrupted by high-intensity events (intensity >= interruptThreshold)
- On interruption: `currentAction` is cleared, no arrival memory, NPC resumes free decisioning
- On arrival: `arrivalAction` is auto-executed. Success writes arrival memory; failure writes failure memory and NPC resumes free decisioning next tick

### 5. Memory

Three rules:

- **Move initiation**: immediately push `"${name} 前往 ${targetNode} ${reason}"` to shortMemory
- **Arrival success**: push `"${name} 到达了 ${targetNode}，开始 ${arrivalAction.type}"`
- **Arrival failure**: push `"${name} 到达了 ${targetNode}，但 ${reason}"`
- **Interrupted**: no new memory (initiation memory already recorded)

Intermediate steps along the path are not recorded.

### 6. Removed mechanisms

- `MAX_FREE_MOVES` free-move chain loop
- `travelCost` no longer affects pathfinding or arrival delay
- Shortcuts are now regular edges (1 tick)

### 7. Vitals during movement

Same rule as before — vitals decay at half speed while traveling. Distributed across ticks.

### 8. Prompt changes

- Available destinations shown as full map tree (grouped by hierarchy), not just adjacent nodes
- System prompt updated to explain tick-based movement and auto-pathfinding
- `buildActionContext()` adjusted to include all map nodes rather than just reachable neighbors

### 9. Frontend

- Moving NPCs show status: `前往 ${nodeName} 途中 (${step}/${total}步)`
- Position updates each tick — NPCs visible moving through intermediate nodes on the map

## Files to change

| File | Change |
|------|--------|
| `src/domain/enums.ts` | No change (reuse `move`) |
| `src/domain/types.ts` | Extend Action to include `reason`, `arrivalAction`, `path`, `stepIndex` on OngoingAction |
| `src/domain/schemas.ts` | Update `ActionToolInputSchema` move parameters |
| `src/engine/pathfinding.ts` | **New** — BFS shortest path |
| `src/engine/tick.ts` | Remove free-move loop, add auto-step + arrival logic, `TICKS_PER_HOUR` |
| `src/engine/execute.ts` | Handle arrivalAction auto-execution |
| `src/engine/actions.ts` | `buildActionContext` returns full map nodes |
| `src/llm/prompt.ts` | Update system prompt, available nodes rendering |
| `src/engine/vitals-emotion.ts` | Distribute decay across ticks |
| `configs/maps/*.json` | `travelCost` field retained but no longer used for path cost |
