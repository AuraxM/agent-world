# Decide Prompt 约束优化 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the decide action prompt with a decision priority framework, anti-repeat rules, notebook elevation, and speak-target tracking — so characters make better decisions about vitals, socializing, and commitments.

**Architecture:** Four-file change: extend `AggregatedFacts` with speak-target data; enhance `describeContinuity` to render it; restructure `buildUserPrompt` with priority framework, hardened rules, and cache-friendly ordering; adjust notebook label. All changes are additive or surgical — no new files, no LLM flow changes.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add `targetId` to `lastAction` and `todaySpeakTargets` to `AggregatedFacts`

**Files:**
- Modify: `packages/systems/src/facts.ts:23-42, 106-127`
- Test: `packages/systems/src/facts.test.ts:203-224`

- [ ] **Step 1: Update `AggregatedFacts` interface**

In `packages/systems/src/facts.ts`, update the `lastAction` type and add `todaySpeakTargets`:

```typescript
export interface AggregatedFacts {
  activityNodeId: string | null;
  activityNodeName: string | null;
  restNodeId: string | null;
  restNodeName: string | null;
  hoursAtCurrentLocation: number;
  lastAction?: {
    type: string;
    freeText?: string;
    tick: Tick;
    success: boolean;
    targetId?: string;
  };
  lastRestTick?: Tick;
  lastEatTick?: Tick;
  todayActionCounts: Partial<Record<string, number>>;
  /** 今日 speak 的目标角色 ID → 次数（仅记录 speak 类型）。 */
  todaySpeakTargets: Record<string, number>;
}
```

- [ ] **Step 2: Update `deriveAggregatedFacts` to populate new fields**

In the same file, update the `lastAction` construction (lines 109-116) and add `todaySpeakTargets` computation:

```typescript
// lastAction：优先用 character.lastThought（store.loadWorld 自动注入）；
// fallback 用 recentThoughts[0]（兼容测试中 character 没 lastThought 的情况）。
const head = character.lastThought ?? recentThoughts[0];
const lastAction = head
  ? {
      type: head.action.type,
      freeText: head.action.freeText,
      tick: head.tick,
      success: head.success,
      targetId: head.action.targetId,
    }
  : undefined;
```

After the `todayActionCounts` loop (after line 104), add speak-target counting:

```typescript
// 今日 speak 目标计数
const todaySpeakTargets: Record<string, number> = {};
for (const t of recentThoughts) {
  if (t.tick < cutoff) break;
  if (t.action.type === "speak" && t.action.targetId) {
    todaySpeakTargets[t.action.targetId] =
      (todaySpeakTargets[t.action.targetId] ?? 0) + 1;
  }
}
```

Add `todaySpeakTargets` to the return object:

```typescript
return {
  activityNodeId,
  activityNodeName,
  restNodeId,
  restNodeName,
  hoursAtCurrentLocation,
  lastAction,
  lastRestTick,
  lastEatTick,
  todayActionCounts,
  todaySpeakTargets,
};
```

- [ ] **Step 3: Update facts test**

In `packages/systems/src/facts.test.ts`, update the `lastAction` test at line 218 to include `targetId`:

```typescript
it("character.lastThought 优先于 recentThoughts[0] 作为 lastAction", () => {
    const stale = mkThought(5, mkAction("wait"));
    const fresh: AgentThought = mkThought(
      10,
      mkAction("speak", { freeText: "你好", targetId: "char-y" }),
    );

    const facts = deriveAggregatedFacts({
      character: { ...baseCharacter, lastThought: fresh },
      nodes: baseNodes,
      currentTick: 11,
      recentThoughts: [stale],
      activityNodeId: null,
      restNodeId: null,
    });
    expect(facts.lastAction).toEqual({
      type: "speak",
      freeText: "你好",
      tick: 10,
      success: true,
      targetId: "char-y",
    });
  });
```

Add a test for `todaySpeakTargets`:

```typescript
it("todaySpeakTargets 统计今日 speak 目标", () => {
    const thoughts: AgentThought[] = [
      mkThought(10, mkAction("speak", { targetId: "alice" })),
      mkThought(9, mkAction("speak", { targetId: "bob" })),
      mkThought(8, mkAction("speak", { targetId: "alice" })),
      mkThought(7, mkAction("eat")),
    ];
    const facts = deriveAggregatedFacts({
      character: baseCharacter,
      nodes: baseNodes,
      currentTick: 11,
      recentThoughts: thoughts,
      activityNodeId: null,
      restNodeId: null,
    });
    expect(facts.todaySpeakTargets).toEqual({ alice: 2, bob: 1 });
  });
```

- [ ] **Step 4: Update prompt test `emptyFacts`**

In `src/llm/prompt.test.ts`, add `todaySpeakTargets: {}` to the `emptyFacts` object (line 81):

```typescript
const emptyFacts: AggregatedFacts = {
  activityNodeId: null,
  activityNodeName: null,
  restNodeId: null,
  restNodeName: null,
  hoursAtCurrentLocation: 0,
  todayActionCounts: {},
  todaySpeakTargets: {},
};
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test`
Expected: All tests pass (431 tests)

```bash
git add packages/systems/src/facts.ts packages/systems/src/facts.test.ts src/llm/prompt.test.ts
git commit -m "feat: add targetId to lastAction and todaySpeakTargets to AggregatedFacts"
```

---

### Task 2: Enhance `describeContinuity` with speak target and speak counts

**Files:**
- Modify: `packages/llm/src/prompt.ts:1222-1253`
- Modify: `packages/llm/src/prompt.ts:1333` (call site)
- Test: `src/llm/prompt.test.ts:361-395`

- [ ] **Step 1: Update `describeContinuity` signature and body**

Change the function to accept `nameMap` for ID-to-name resolution:

```typescript
function describeContinuity(
  facts: AggregatedFacts,
  hereName: string,
  currentTick: number,
  nameMap: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`- 已在 ${hereName} 连续 ${facts.hoursAtCurrentLocation} 小时`);

  if (facts.lastAction) {
    const { type, freeText, success, targetId } = facts.lastAction;
    const verb = getActionNames()[type] ?? type;
    const ok = success ? "" : "（未成功）";
    const detail = freeText ? `："${freeText.slice(0, 40)}"` : "";
    const targetPart = type === "speak" && targetId
      ? `，对象：${nameMap.get(targetId) ?? targetId}`
      : "";
    lines.push(`- 上一 tick 你的行动：${verb}${ok}${detail}${targetPart}`);
  } else {
    lines.push("- 上一 tick：（无历史，世界刚开始）");
  }

  lines.push(
    facts.lastRestTick === undefined
      ? "- 距上次 rest/sleep：从未休息过"
      : `- 距上次 rest/sleep：${Math.floor((currentTick - facts.lastRestTick) / TICKS_PER_HOUR)} 小时`,
  );
  lines.push(
    facts.lastEatTick === undefined
      ? "- 距上次 eat：从未进食过"
      : `- 距上次 eat：${Math.floor((currentTick - facts.lastEatTick) / TICKS_PER_HOUR)} 小时`,
  );

  lines.push(`- 今日累计：${formatActionCounts(facts.todayActionCounts)}`);

  // Speak counts per target
  const speakEntries = Object.entries(facts.todaySpeakTargets);
  if (speakEntries.length > 0) {
    const parts = speakEntries
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${nameMap.get(id) ?? id} ${count} 次`);
    lines.push(`- 今日已对话：${parts.join("，")}`);
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Update call site in `buildUserPrompt`**

At line 1333, pass `nameMap`:

```typescript
lines.push(describeContinuity(facts, here.name, tick, nameMap));
```

- [ ] **Step 3: Update continuity test**

In `src/llm/prompt.test.ts`, update the "连续行为段含 hours / lastAction / today counts" test (line 361). Replace with a test that includes a speak target:

```typescript
it("连续行为段含 hours / lastAction with speak target / today counts / speak targets", () => {
    const out = buildUserPrompt({
      character: { ...baseCharacter, id: "char-x", name: "测试角色" },
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 12,
      epoch: TEST_EPOCH,
      facts: {
        activityNodeId: null,
        activityNodeName: null,
        restNodeId: null,
        restNodeName: null,
        hoursAtCurrentLocation: 14,
        lastAction: {
          type: "speak",
          freeText: "你好啊",
          tick: 11,
          success: true,
          targetId: "char-wang",
        },
        lastRestTick: 0,
        lastEatTick: 5,
        todayActionCounts: { speak: 9, observe: 2, wait: 1 },
        todaySpeakTargets: { "char-wang": 3, "char-li": 1 },
      },
      nodes: [restaurant],
      allCharacters: [
        { ...baseCharacter, id: "char-x", name: "测试角色" },
        { ...baseCharacter, id: "char-wang", name: "王阿姨" },
        { ...baseCharacter, id: "char-li", name: "李大叔" },
      ],
    });
    expect(out).toContain("已在 老王饭馆 连续 14 小时");
    expect(out).toContain("上一 tick 你的行动：speak，对象：王阿姨");
    expect(out).toContain("你好啊");
    expect(out).toContain("speak ×9");
    expect(out).toContain("王阿姨 3 次");
    expect(out).toContain("李大叔 1 次");
  });
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test`
Expected: This specific test may fail until Task 3 is done, but the facts tests should pass. Run all and verify facts tests pass.

```bash
git add packages/llm/src/prompt.ts src/llm/prompt.test.ts
git commit -m "feat: add speak target name and counts to describeContinuity"
```

---

### Task 3: Restructure `buildUserPrompt` — priority framework, rules, reorder, cleanup

**Files:**
- Modify: `packages/llm/src/prompt.ts:1292-1506`
- Test: `src/llm/prompt.test.ts:295-359` (urgency tests → priority framework tests)

- [ ] **Step 1: Add decision priority framework after goals**

After the goals section (currently line 1329, after `lines.push("");` for goals), insert:

```typescript
  // 0.7. 决策优先级（跨 tick 不变，放在缓存前缀区）
  lines.push("## 决策优先级（严格遵守从上到下的顺序）");
  lines.push("");
  lines.push("### 1. 生理需求（最高优先）");
  lines.push("当你感到明显饥饿、明显疲惫或明显不干净时，必须优先解决：");
  lines.push("- 饥饿 → move 去用餐场所（dining 标签）eat");
  lines.push("- 疲惫 → move 去休息场所（residence 标签或 private）rest/sleep");
  lines.push("- 卫生 → move 去洗浴场所（bathing 标签）bathe");
  lines.push("生理需求未解决之前，不要做其他事。");
  lines.push("");
  lines.push("### 2. 履行约定");
  lines.push("记事本中如果有当前时段或即将到期的待办事项，优先赴约。");
  lines.push("约定好的事不去做，就是不守信用。");
  lines.push("");
  lines.push("### 3. 社交适度");
  lines.push("不要连续两 tick 对同一个人 speak。");
  lines.push("如果你上一 tick 刚和某人说过话，这 tick 换个人或者做别的事。");
  lines.push("");
  lines.push("### 4. 自由行动");
  lines.push("以上都不触发时，根据你的性格、目标、感知到的事件自由选择。");
  lines.push("");
```

- [ ] **Step 2: Move and strengthen behavior rules**

Before the cache breakpoint (after the priority framework), insert the restructured behavior rules. Replace the current behavior rules section at line 1437-1441:

Delete this (old position, will be removed in step 4):
```typescript
lines.push("## 行为规则");
lines.push("- 与人互动后产生了新印象或了解到重要信息时，调用 memorize 记录下来，不要只在心里想。");
lines.push("- 禁止编造不存在的约定、任务、计划或人物。只依据你的记忆和真实经历做判断。");
lines.push("");
```

Insert this right after the decision priority framework (before cache breakpoint):

```typescript
  // 0.8. 行为规则（跨 tick 不变，放在缓存前缀区）
  lines.push("## 行为规则");
  lines.push("");
  lines.push("### 必须遵守");
  lines.push("- 生理需求（饿了吃、困了睡、脏了洗）是本能，不由性格左右。不论你是外向还是内向、勤快还是懒散，该吃饭时必须吃饭，该睡觉时必须睡觉。");
  lines.push("- 禁止连续两 tick 对同一个人 speak。换个人说话，或者做别的事。");
  lines.push("- 禁止编造不存在的约定、任务、计划或人物。只依据你的记忆和真实经历做判断。");
  lines.push("- 记事本上有待办事项时，必须在当前时间段内规划执行。不可无故拖延。");
  lines.push("");
  lines.push("### 建议遵守");
  lines.push("- 与人互动后产生了新印象或了解到重要信息时，调用 memorize 记录下来。");
  lines.push("- 不确定对方是谁时，先 recall 查询，不要假装认识陌生人。");
  lines.push("");
```

- [ ] **Step 3: Remove vitals guidance and urgency reminders**

Delete the vitals guidance block (lines 1349-1365):
```typescript
  // 生理状态引导：数值 > 8 时注入行动建议  ← DELETE THIS ENTIRE BLOCK
  const vitalGuidance: string[] = [];           ...
  ...                                           ...
  }                                             ...
```

Delete the urgency reminders block (lines 1385-1411):
```typescript
  // 3.2 紧迫提醒                                 ← DELETE THIS ENTIRE BLOCK
  const fatigueUrgent = ...                      ...
  ...                                           ...
  lines.push("");                                ...
```

- [ ] **Step 4: Move notebook entries before economic state**

Move `upcomingNotebookText` rendering from the end of the prompt (lines 1497-1499) to after social satiety / before economic state. Insert:

```typescript
  // 3.3 约定的待办
  if (upcomingNotebookText && upcomingNotebookText.length > 0) {
    lines.push(upcomingNotebookText, "");
  }
```

And remove it from the original position (near line 1497-1499).

- [ ] **Step 5: Update companionship section**

Remove "不要假装认识陌生人" from the companionship section (line 1433) since it's now in behavior rules:

```typescript
    lines.push(`同节点其他人物（共 ${companions.length} 人）：${names}`);
    lines.push("如果你不熟悉其中某人，先调用 recall 查询你对TA的了解，再决定如何互动。");
```

- [ ] **Step 6: Replace urgency tests with priority framework tests**

In `src/llm/prompt.test.ts`, replace the three urgency ⚠ tests (lines 295-359) with three new tests:

```typescript
  it("决策优先级框架在 prompt 中渲染", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      epoch: TEST_EPOCH,
      facts: emptyFacts,
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("## 决策优先级");
    expect(out).toContain("### 1. 生理需求");
    expect(out).toContain("### 2. 履行约定");
    expect(out).toContain("### 3. 社交适度");
    expect(out).toContain("### 4. 自由行动");
  });

  it("行为规则包含必须和建议两层", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      epoch: TEST_EPOCH,
      facts: emptyFacts,
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("### 必须遵守");
    expect(out).toContain("### 建议遵守");
    expect(out).toContain("禁止连续两 tick 对同一个人 speak");
    expect(out).toContain("生理需求");
  });

  it("notebook 待办在 prompt 中渲染且在决策优先级之后", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      epoch: TEST_EPOCH,
      facts: emptyFacts,
      nodes: [restaurant],
      allCharacters: [baseCharacter],
      upcomingNotebookText: "约定的待办：\n- 1小时后 — 和张三约好开会",
    });
    expect(out).toContain("约定的待办：");
    expect(out).toContain("和张三约好开会");
    // 待办应在经济状态之前
    const notebookIdx = out.indexOf("约定的待办：");
    const economyIdx = out.indexOf("你的经济状态：");
    expect(notebookIdx).toBeLessThan(economyIdx);
  });
```

Remove the old urgency tests (lines 295-359).

- [ ] **Step 7: Remove old "你最好" and ⚠ references from remaining tests**

Check for any remaining tests that assert the old vitals guidance or urgency content. Run:

```bash
grep -n '⚠\|你最好' src/llm/prompt.test.ts
```

Expected: No results.

- [ ] **Step 8: Run tests and commit**

Run: `pnpm test`
Expected: All tests pass

```bash
git add packages/llm/src/prompt.ts src/llm/prompt.test.ts
git commit -m "feat: add decision priority framework, strengthen behavior rules, reorder prompt for cache"
```

---

### Task 4: Change notebook label from "待办" to "约定的待办"

**Files:**
- Modify: `packages/systems/src/notebook.ts:127`

- [ ] **Step 1: Update `describeEntries` label**

```typescript
export function describeEntries(
  entries: NotebookEntry[],
  currentTick: Tick,
  epoch: number,
): string {
  if (entries.length === 0) return "";
  const lines = entries.map(
    (e) => `- ${formatRelativeTime(e.scheduledTick, currentTick, epoch)} — ${e.content}`,
  );
  const allToday = entries.every(
    (e) => sameUTCDay(e.scheduledTick, currentTick, epoch),
  );
  const label = allToday ? "约定的待办" : "约定的待办";
  return `${label}：\n${lines.join("\n")}`;
}
```

(Note: simplified to always use "约定的待办" since all entries are commitments, not generic TODOs.)

- [ ] **Step 2: Run tests and commit**

Run: `pnpm test`
Expected: All tests pass

```bash
git add packages/systems/src/notebook.ts
git commit -m "fix: change notebook label from 待办 to 约定的待办"
```

---
