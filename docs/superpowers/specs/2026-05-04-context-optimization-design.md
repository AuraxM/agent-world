# Context Structure Optimization

**Date:** 2026-05-04
**Status:** approved → implementation

## Problem Summary

1. **Prompt cache hit rate is suboptimal** — `characterBlock` sits at the end of the system prompt, making the system prompt partially unique per character. Moving it to the user prompt makes the system prompt 100% shared across all NPCs.

2. **Tool call inaccuracy** — `arrival_action.action_type` frequently carries the `action_` prefix (e.g. `action_eat` instead of `eat`), causing registry lookup failures and fallback memories. `action_move` hints enumerate all 25 map nodes, encouraging aimless wandering. `action_speak` hints enumerate all companions by name, adding noise.

3. **NPC identity confusion** — Characters use terms like "当家" (master/boss) in relation notes, which the LLM misinterprets as "father/family head." Workplace hierarchy is scattered across profession field, biography, and relations, with no consolidated identity statement.

4. **Short-term memory redundancy** — Move actions generate duplicate memories. Consecutive same-type actions (wait ×N) fill the context without adding information.

## Design

### 1. Cache Restructuring — Move characterBlock to User Prompt

**System prompt** becomes 100% shared across all NPCs:
```
[worldRules | mapGraph | languageInstruction]
```

**User prompt** gains `identityAnchor` (one-liner) and `characterStatic` (former characterBlock):
```
[identityAnchor | characterStatic | time | location | vitals/emotion/urgency | economy | peers | events | memories | options | instruction]
```

Cache behavior after change:
- Before: system prompt cache hits on `worldRules + mapGraph + languageInstruction`, misses on `characterBlock` (unique per NPC)
- After: system prompt 100% cache hit across ALL NPCs. User prompt is fully dynamic (no caching), but user prompt size grows by ~600 chars (characterBlock). Net token savings: system prompt tokens × (NPC count - 1) per tick.

### 2. Identity Anchor

User prompt begins with a single-line identity statement:

```
你是{name}，{age}岁的{profession_label}。{workplace_relation_info}
```

Workplace relation info is derived from relations:
- If has boss: `{boss_names}是你的老板。`
- If has subordinates: `{sub_names}是你的下属/帮手。`
- If has colleagues: `{colleague_names}是你的同事。`

This is the FIRST text the LLM reads in the user prompt, anchoring identity before any dynamic state.

### 3. Directional Relation Display

In the companions section, relation kinds are displayed with directional Chinese labels:

| Kind | Display |
|------|---------|
| boss | 你的老板 |
| subordinate | 你的下属 |
| colleague | 你的同事 |
| spouse | 你的配偶 |
| parent/child/sibling | 你的(父亲/母亲/儿子/女儿/兄/弟/姐/妹) |
| friend | friend |
| acquaintance | 熟人 |
| partner | 你的伴侣 |
| ex_partner | 前伴侣 |

Format: `- {name} —— 你的{role}，{other_kinds}，{affection}——{note}`

### 4. Tool Accuracy Fixes

**arrival_action prefix strip:**
In tick.ts arrival handling, normalize `arrivalAction.action_type`:
```
if (actionType.startsWith("action_")) actionType = actionType.slice(7)
```

**action_move hint simplification:**
- Remove per-node enumeration
- Urgent vital situations: suggest specific destination (rest node / dining node / bathing node)
- No urgency: "前往地图上任意地点（在 reasoning 中说清楚你为什么要去那里）"
- The LLM decides WHERE by reasoning, using the map graph in the system prompt

**action_speak hint simplification:**
- Replace per-companion enumeration ("和 X 交谈", "和 Y 交谈", ...) with a single generic entry: "和身边的人说话"

### 5. Memory Dedup

**Move memories:** Keep 2 of the original 3:
- "开始前往 {dest}，共需 {N} 步。原因为：{reason}" — kept for interrupt recovery
- "X 到达了 {dest}，开始 {action}" — kept for completion record
- **Remove:** "X 前往 Y" (duplicate of "开始前往")

**Short memory display:**
- Reduce from 6 to 4 items in user prompt
- If 2+ consecutive memories have the same action type, collapse: show the collapsed count + last item
- Filter: exclude memories whose content is an exact duplicate of the previous one

### Files to Modify

| File | Changes |
|------|---------|
| `src/llm/prompt.ts` | identityAnchor(); characterBlock moves to user prompt; directional relation labels; memory collapse; buildSystemPrompt without characterBlock |
| `src/llm/decide.ts` | buildSystemPrompt call updated; arrival_action.action_type normalization |
| `src/engine/tick.ts` | move memory dedup (remove "前往" duplicate); arrival action normalize |
| `src/engine/actions-builtin.ts` | move hint simplification; speak hint simplification |
| `src/engine/execute.ts` | arrival action type normalization |

### Non-Goals

- Map graph trimming (user explicitly wants to keep it)
- Token reduction (user says current token consumption is acceptable)
- Database schema changes
- New relation kinds (existing `boss`, `subordinate`, `colleague` are sufficient)
