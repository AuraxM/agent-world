---
name: agent-world-cache
description: Use when modifying or adding any per-turn dynamic content to dialogue prompts (buildDialogTurnPrompt, buildDialogTurnFollowup, decide prompt, think prompt) in the agent-world project. Triggers include "对话prompt"、"加一个提示"、adding new prompt blocks, changing prompt structure, or any LLM prompt modification. Ensures prompt prefix stability for maximum LLM cache hit rate.
---

# Agent World LLM Prompt Cache Optimization

## Principle

LLM providers (OpenAI, Anthropic, DeepSeek) cache prompts by **prefix matching**. If prefix N tokens match a previously seen prompt, those N tokens cost $0 and have zero latency.

The dialogue prompt is called once per character turn — potentially hundreds of times per session. Cache miss = paying for the full prompt every time.

## The Rule

> **Everything that stays the same across turns goes FIRST. Everything that changes goes LAST.**

The prompt prefix must be **bit-identical across all turns of the same dialogue**. If even one character differs, the entire suffix is a cache miss.

## Correct structure

```
[identity ×3]              ← never changes
[world description]          ← never changes
[emotion/vitals state]       ← subtle changes but acceptable (per-tick)
[dialogue actions list]      ← never changes
[upcoming entries]           ← per-hour, stable enough
                             ← ↑ CACHE BOUNDARY — everything above is reusable ↑
对话记录：[history]           ← append-only (cache still works because prefix grows)
【当前地点：XXX】              ← SUFFIX: location changes on travel_together / move
⚠️ 对方发起的交互...          ← SUFFIX: pending action appears/disappears per turn
```

## Prohibited prefix content

These MUST NOT appear in the prompt prefix (before `对话记录：`):

- **Location** (`describeLocalMap` / `当前地点：XXX`) — changes when characters move, especially with `travel_together`
- **Pending action notification** (`⚠️ 对方发起的交互...`) — appears/disappears per turn
- **Any per-turn dynamic annotation** — including status hints, cooldown timers, transient flags

## Implementation pattern

In `buildDialogTurnPrompt` (first turn, `prompt.ts`):

```typescript
// PREFIX: stable, identical every turn of the same dialogue
lines.push(selfDesc);
lines.push(peerDesc);
lines.push(emotionState);
lines.push(dialogueActions);
lines.push(upcomingEntries);
lines.push("");
lines.push("对话记录：");
lines.push(history);

// SUFFIX: per-turn variable, appended AFTER the stable prefix
if (nodes) {
  lines.push("");
  lines.push(describeLocalMap(here, nodes, language));
} else {
  lines.push("");
  lines.push(`【当前地点：${here.name}】`);
}
const paBlock = buildPendingActionBlock(language);
if (paBlock) lines.push(paBlock.trimStart());
```

`buildDialogTurnFollowup` (subsequent turns) naturally avoids this problem because it appends to `previousMessages` — the entire prior context is reused. Only the new followup text is a new user message.

## Self-check

When adding ANY new information to a dialogue/decide/think prompt, ask:

> **"Is this line bit-for-bit identical across every turn of the same dialogue?"**

- YES → safe for prefix
- NO → must go in suffix (after `对话记录：[history]`)
- NOT SURE → put it in suffix; a false suffix miss is cheaper than a false prefix break

## Files to watch

| File | Role |
|------|------|
| `backend/src/llm/prompt.ts` | All prompt builders: `buildDialogTurnPrompt`, `buildDialogTurnFollowup`, `buildDecideUserPrompt`, `buildThinkSystemPrompt` |
| `backend/src/llm/decide.ts` | `llmDialogTurn` — first-turn vs subsequent path selection |
| `backend/src/llm/dialog.ts` | `runOneTickDialog` — owns `sharedMessages` persistence and followup injection |

## Common mistakes

1. **Adding location to the prefix** — "当前地点：XXX" between identity and transcript. Cache poison.
2. **Adding pending action to the prefix** — `⚠️ 对方发起的交互...` before history. Every turn break.
3. **"Just this one field, it's small"** — Size doesn't matter. Any difference in the prefix = full cache miss.
4. **Adding a new prompt section without checking which side of the boundary it belongs on** — Always ask: does this change per turn?
