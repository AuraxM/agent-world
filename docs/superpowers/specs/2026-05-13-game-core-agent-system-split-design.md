# Game Core / Agent System Split Design

## Summary

Split the current monolithic backend into two independent systems:

- **Game Core** — deterministic rule-based game logic (vitals, movement, perception, action execution, economy)
- **Agent System** — LLM-driven agent intelligence (decision, dialogue, memory, thinking)

Agent System becomes a standalone reusable npm package. Game Core stays in the current monorepo. This spec covers the boundary between them and the Agent System API contract. Implementation is in a new `agentic-character` project outside agent-world; agent-world is not modified in this phase.

## Motivation

- Clean development boundary between rule logic and LLM intelligence
- Agent System reusable across projects as an npm package
- Each side independently testable

## Module Boundary

### Game Core (backend/src/)

| Module | Content |
|--------|---------|
| `systems/vitals-emotion.ts` | Hunger/fatigue/hygiene decay, mood, stress, sickness |
| `systems/bme.ts` | Metabolic formulas |
| `systems/pathfinding.ts` | BFS graph traversal |
| `systems/perception.ts` | Event distribution by scope |
| `systems/execute.ts` | State change application, conflict arbitration |
| `systems/economy.ts` | Transactions, wealth, pricing |
| `systems/relations.ts` | Auto-acquaintance |
| `systems/store.ts` | DB persistence |
| `systems/notebook.ts` | Entry CRUD |
| `systems/actions.ts` | buildActionContext, getAvailableActions |
| `systems/actions-builtin.ts` | Physical action definitions (eat, move, sleep, etc.) |
| `systems/facts.ts` | Aggregated structured facts from event history |
| `systems/character-maps.ts` | Config map building |
| `domain/action-system.ts` | ActionRegistry (check, execute, validateParams) |
| `domain/types.ts` | Character, World, MapNode, Event types (not Memory/ThinkSession) |
| `config/` | Scene loaders, mod loaders |
| `db/` | Persistence (no memory/think repositories) |
| `server/` | Fastify + tick orchestration |

### Agent System (agentic-character/packages/agent-system/)

| Module | Content |
|--------|---------|
| `agent/` | AgentSystem class, clock, step orchestration |
| `registration/` | Entity registry, handler type definitions |
| `decide/` | LLM decision (action choice via ReAct loop) |
| `dialog/` | Chat pairing, turn-taking, summarization |
| `cognitive/` | Memory store (short/daily/weekly), impression, think, builtin cognitive actions |
| `prompt/` | System prompts, prompt builder |
| `llm/` | OpenAI-compatible client, provider config |
| `storage/` | Storage adapter (memory-based default, swappable) |

### What Agent System manages internally (no Game Core involvement)

- **Memory** — short/daily/weekly tiers, compression (think)
- **Impression** — character impressions
- **Builtin cognitive actions** — chat, think, remember, forget, reflect, judge

## Entity Registration

Agent System defines the registration API. Game Core registers functions at startup. No interface objects — function registration by entity type.

### 1. character

```
get(id: string) => CharacterSnapshot | null
listAtNode(nodeId: string) => CharacterSnapshot[]
getRelation(a: string, b: string) => RelationSnapshot | null
```

Returns: vitals, position, personality, goals.

### 2. action

```
getAvailable(characterId: string) => ActionOption[]
validateParams(actionId: string, params: unknown) => { valid: true } | { valid: false, error: string }
getActionHint(actionId: string) => string
```

ActionOption includes: id, name, hint text, paramSchema (Zod). Only physical actions (eat, move, bathe, sleep, work, buy, give, look_around, etc.). Cognitive actions (chat, think, reflect...) are Agent System's own builtins.

### 3. event

```
getPerceivable(characterId: string) => GameEvent[]
getRecent(characterId: string, hours: number) => GameEvent[]
```

Scope-filtered (perception.ts), not attention-filtered.

### 4. world

```
getContext() => WorldContext
getNode(id: string) => MapNode | null
getTime() => GameTime
```

## Tick Flow

### Game Core tick (fast, deterministic, ~5 ticks/game hour)

1. Vitals decay + inner events
2. Emotion evolution
3. Perception dispatch
4. `agentSystem.acceptEvents(charId, events)` — feed events continuously
5. Continue ongoing actions
6. Persistence

### Agent System step (slower, LLM-driven)

Triggered by Game Core when it decides agents should think. Agent System does not decide its own schedule.

```
result = await agentSystem.step()
```

Internally:
1. Process all accumulated events since last step
2. `decide()` for each character (concurrent where possible)
3. `runDialog()` for pending/in-progress conversations
4. Execute internal cognitive actions
5. Advance internal clock by configured stepDuration
6. Return `StepResult`

### StepResult

```typescript
type StepResult = {
  decisions: Array<{
    characterId: string;
    actionId: string;
    params: Record<string, unknown>;
    reasoning: string;
  }>;
  dialogTurns: Array<{
    pair: [string, string];
    turns: Array<{
      speakerId: string;
      message: string;
      action?: { actionId: string; params: Record<string, unknown> };
    }>;
    summary: string;
  }>;
  newTime: GameTime;
};
```

Game Core applies physical decisions via ActionRegistry, persists dialog logs.

### Key properties

- Game Core tick is faster than Agent System step (multiple ticks per step)
- `acceptEvents()` can be called at any time between steps
- `validateParams` failure triggers retry inside Agent System's agent loop (up to 3 rounds)
- All character decide() calls within a step are concurrent

## Agent System Public API

```typescript
class AgentSystem {
  register<T extends EntityType>(type: T, handlers: HandlerMap[T]): void;
  initialize(config: AgentConfig): Promise<void>;
  acceptEvents(characterId: string, events: GameEvent[]): void;
  step(): Promise<StepResult>;
  getTime(): GameTime;
}

type AgentConfig = {
  time: GameTime;
  stepDuration: GameDuration;
  wallTimeBudget: number;        // ms, real-world time limit for step
  llm: LLMProviderConfig;
  storage?: StorageAdapter;      // optional, defaults to in-memory
};
```

## Project Structure

```
agentic-character/              # new project, outside agent-world
├── packages/
│   └── agent-system/           # Agent System npm package
│       └── src/
│           ├── index.ts
│           ├── agent/          # AgentSystem class, clock, step
│           ├── registration/   # registry, handler types
│           ├── decide/         # LLM decision + agent loop
│           ├── dialog/         # chat pairing, turns, summarize
│           ├── cognitive/      # memory, impression, think, builtin actions
│           ├── prompt/         # system prompts, prompt builder
│           ├── llm/            # client, provider config
│           └── storage/        # storage adapter interface
├── test-game/                  # minimal Game Core for validation
│   ├── game-core/              # tick, actions, state
│   ├── adapter.ts              # 4 entity registrations
│   └── scenarios/              # 2-3 chars, 3-5 nodes
└── tests/
    └── integration.test.ts     # e2e: init → step → verify StepResult
```

## Test Game Core

Minimal implementation sufficient to validate the Agent System. Does NOT include: SQLite/Drizzle, HTTP server, economy, pathfinding, employment, notebook, mod loader, admin routes, frontend.

Has: 2-3 characters (vitals, position, personality), 3-5 map nodes, 3-5 physical actions, simple vitals decay, simplified perception, event generation, step triggering.

## What's NOT in scope

- Modifying agent-world code
- Publishing agent-system to npm registry
- HTTP/network communication between Game Core and Agent System
- Multi-language support in prompts
- Performance optimization / caching

## Migration Path (future, not this phase)

1. Build and validate agentic-character independently
2. When stable, replace agent-world's `backend/src/llm/` with agent-system dependency
3. Remove memory/think/impression types from agent-world domain
4. Add `backend/src/agent/adapter.ts` glue layer
5. Update agent-world tick.ts to use AgentSystem.step()
