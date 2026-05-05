# Dialog Context Optimization

**Date:** 2026-05-05
**Status:** approved

## Problem Summary

During dialog phases, NPCs frequently lose awareness of their own identity and the identity of the person they're speaking with. The current prompts provide only name + expanded MBTI traits, with no age, gender, profession, appearance, relationship, or impression data. Additionally:

- Stage 1 (accept decision) shows peripheral noise — perceived events and other companions — instead of relevant information about the conversation partner.
- Stage 2 (dialog turns) lacks any character imagery for either party, causing identity drift over multiple turns.
- Relation labels are directionally ambiguous ("你的老板" is misread by the LLM as "they are MY boss" rather than "I am their boss").

## Design

### 1. New Helper: `buildSelfImage`

Generates an "about yourself" block to anchor self-identity during dialog.

**Input:** `Character`, current node name
**Output:**
```
关于你自己：
- 姓名：{name}
- 年龄：{age} 岁
- 性别：{男/女/其他}
- 职业：{profession_label}
- 形象：{buildImage() output}
- 当前在：{here.name}
```

### 2. New Helper: `buildPeerImage`

Generates an "about the other person" block. External traits only — no internal state.

**Input:** `self: Character`, `peer: Character`
**Output:**
```
关于 {peer.name}：
- 年龄：{peer.age} 岁
- 性别：{男/女/其他}
- 职业：{peer.profession_label}
- 形象：{buildImage(peer) output}
- 客观关系：TA 是你的 {relation}（你是 TA 的 {reverse_relation}）
- 你对 TA 的印象：{impressionBook[peer.id] ?? "暂无特别印象"}
```

Excluded fields: MBTI, intelligence, health, biography, liked/disliked, vitals, emotion.

`buildImage()` is reused — it already covers visible state cues (facial appearance + "两眼无神", "邋遢不洁", "面有菜色", "神采奕奕", "面色阴郁", "神情紧绷").

When no relation exists: `客观关系：你与 TA 尚无正式关系`.

### 3. Relation Direction Fix

Add a reverse-lookup mapping so each directional relation generates both perspectives.
New function `describeRelationBidirectional(self: Character, targetId: string): string`.

The reverse mapping takes `self.gender` into account for parent/child relations:

| Kind | Forward (TA is your...) | Reverse (you are TA's...) depends on self.gender |
|------|-------------------------|---------------------------------------------------|
| boss | 你的老板 | 你的下属 |
| subordinate | 你的下属 | 你的老板 |
| spouse | 你的配偶 | 你的配偶 (symmetric) |
| partner | 你的伴侣 | 你的伴侣 (symmetric) |
| colleague | 你的同事 | 你的同事 (symmetric) |
| father | 你的父亲 | 你的儿子/女儿 |
| mother | 你的母亲 | 你的儿子/女儿 |
| son | 你的儿子 | 你的父亲/母亲 |
| daughter | 你的女儿 | 你的父亲/母亲 |
| older_brother | 你的哥哥 | 你的弟弟/妹妹 |
| younger_brother | 你的弟弟 | 你的哥哥/姐姐 |
| older_sister | 你的姐姐 | 你的弟弟/妹妹 |
| younger_sister | 你的妹妹 | 你的哥哥/姐姐 |
| ex_partner | 前伴侣 | 前伴侣 (symmetric) |

When multiple relation kinds exist, each gets its own bidirectional line.

When no relations exist for the peer: `客观关系：你与 TA 尚无正式关系`.

### 4. Personality Compression

Replace the current 4-line MBTI expansion in dialog prompts with a single line:

```
性格：{E/I}{N/S}{F/T}{P/J}，{intelligence_label}
```

### 5. Stage 1 Changes (`buildAcceptDecisionPrompt`)

**Remove:**
- Perceived events block
- Companions block
- 4-line MBTI expansion

**Add:**
- `buildSelfImage(B)` 
- `buildPeerImage(B, A)` — pre-filled from `impressionBook`, no recall tool call needed
- Single-line personality

**Keep:**
- A's opening freeText
- B's own vitals (fatigue, hunger, mood, stress, social)
- Current time

**Result structure:**
```
{A.name} 想和你说话："{A.freeText}"

关于你自己：
- 姓名：{B.name}
- 年龄：{B.age} 岁
- ...

关于 {A.name}：
- 年龄：{A.age} 岁
- ...
- 客观关系：TA 是你的 {rel}（你是 TA 的 {reverse_rel}）
- 你对 TA 的印象：{impression}

你当前的状态：
- 在 {here.name}
- 疲惫：{fatigue.phrase}
- 饥饿：{hunger.phrase}
- 心情：{mood_word}
- 压力：{stress_word}
- 社交满足：{social_word}

性格：{E/I}{N/S}{F/T}{P/J}，{intelligence_label}

当前时间：第 {day} 日 {HH}:{MM}（{period}）

决定：你是否要和这个人说话？请调用 submit_accept_decision 工具...
```

### 6. Stage 2 Changes (`buildDialogTurnPrompt`)

**Add:**
- `buildSelfImage(self)` — re-anchors every turn
- `buildPeerImage(self, peer)` — re-anchors every turn

**Change:**
- 4-line MBTI → single-line personality

**Result structure:**
```
你是 {self.name}，正在和 {peer.name} 对话。

关于你自己：
- ...

关于 {peer.name}：
- ...

性格：{E/I}{N/S}{F/T}{P/J}，{intelligence_label}

对话记录：
{name1}: {line1}
{name2}: {line2}
...

现在轮到你说话。请根据你的性格自然地回应...
```

### 7. No Changes

- Stage 3 (summary) — unchanged
- Dialog system prompts (minimal) — unchanged
- recall/memorize tools remain available during dialog (for querying third parties or updating impressions), but impression of the conversation partner is pre-filled

## Implementation Notes

### New Functions (in `src/llm/prompt.ts`)
- `buildSelfImage(c: Character, locationName?: string): string` — the "当前在" line is omitted when `locationName` is undefined
- `buildPeerImage(self: Character, peer: Character): string` — includes `impressionBook` lookup and bidirectional relation
- `describeRelationBidirectional(self: Character, targetId: string): string` — reverse-lookup with gender awareness

### Signature Changes
- `buildAcceptDecisionPrompt`: remove `perceived`, `companions`; add `peer: Character`
- `buildDialogTurnPrompt`: add `here: MapNode` param (needed for `buildSelfImage` location line)
- `llmAcceptDecide` in `src/llm/decide.ts`: updated to pass `peer` instead of `perceived`/`companions`
- `TurnDecideFn` in `src/engine/dialog.ts`: add `here: MapNode` to input type
- `runOneTickDialog`: determine each speaker's node and pass it as `here`

### Call Chain for Node Info in Stage 2
`runDialogPhase` has `nodes: MapNode[]` → build nodeById → pass to `runOneTickDialog` → each `turnDecide` call includes the speaker's current node as `here`.

### Tests
- `src/llm/prompt.test.ts`: add tests for `buildSelfImage`, `buildPeerImage`, `describeRelationBidirectional`
- `src/engine/dialog.test.ts`: update mock `turnDecide` to accept new `here` param
