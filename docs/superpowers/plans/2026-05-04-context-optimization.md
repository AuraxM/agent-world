# Context Structure Optimization — Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure LLM context for higher prompt cache hit rate, fix tool call inaccuracies, strengthen NPC identity cognition, and deduplicate memories.

**Architecture:** Move characterBlock from system prompt to user prompt (making system 100% shared across NPCs). Add identity anchor + directional relation labels. Normalize `arrival_action.action_type` prefix. Simplify `action_move` and `action_speak` hints. Collapse consecutive same-type short memories in display. Dedup move memories.

**Tech Stack:** TypeScript, Zod, OpenAI-compatible function calling

---

### Task 1: Directional relation labels in describeRelations

**Files:**
- Modify: `src/llm/prompt.ts:150-178`

- [ ] **Step 1: Add directional label map + rewrite `describeRelations`**

Insert after `describeAffection` closing (line 114):

```typescript
// ---------------------------------------------------------------------------
// directional relation labels
// ---------------------------------------------------------------------------

const DIRECTIONAL_KIND_LABELS: Record<string, string> = {
  boss: "你的老板",
  subordinate: "你的下属",
  colleague: "你的同事",
  spouse: "你的配偶",
  father: "你的父亲",
  mother: "你的母亲",
  son: "你的儿子",
  daughter: "你的女儿",
  older_brother: "你的哥哥",
  younger_brother: "你的弟弟",
  older_sister: "你的姐姐",
  younger_sister: "你的妹妹",
  parent: "你的父亲/母亲",
  sibling: "你的手足",
  partner: "你的伴侣",
  ex_partner: "前伴侣",
};
```

Replace the entire `describeRelations` function (lines 154-178):

```typescript
function describeRelations(
  c: Character,
  peers: Character[],
  tick: number,
): string {
  if (peers.length === 0) return "（同节点没有其他人）";
  return peers
    .map((p) => {
      const r = c.relations[p.id];
      if (!r) return `- ${p.name}（陌生人）`;
      const directionalParts: string[] = [];
      const otherKinds: string[] = [];
      for (const k of r.kinds) {
        if (DIRECTIONAL_KIND_LABELS[k]) {
          directionalParts.push(DIRECTIONAL_KIND_LABELS[k]);
        } else {
          otherKinds.push(k);
        }
      }
      const kindsDisplay = [...directionalParts, ...otherKinds].join("、");
      const aff = describeAffection(r.affection);
      const noteSuffix = r.note ? `——${r.note}` : "";
      let warn = "";
      if (r.kinds.includes("acquaintance")) {
        const decayIn = ACQUAINTANCE_DECAY_TICKS - (tick - r.lastInteractionTick);
        if (decayIn <= ACQUAINTANCE_WARN_TICKS && decayIn > 0) {
          warn = `（再 ${Math.floor(decayIn / TICKS_PER_HOUR)} 小时未互动就会淡出）`;
        }
      }
      return `- ${p.name} —— ${kindsDisplay}，${aff}${noteSuffix}${warn}`;
    })
    .join("\n");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: add directional relation labels to companion display"
```

---

### Task 2: Move characterBlock to user prompt + identity anchor

**Files:**
- Modify: `src/llm/prompt.ts:629-672` (characterBlock rename + export)
- Modify: `src/llm/prompt.ts:845-863` (buildSystemPrompt)
- Modify: `src/llm/prompt.ts:915-1062` (buildUserPrompt)
- Modify: `src/llm/decide.ts:123-150` (callLLM)
- Modify: `src/engine/tick.ts:60-80` (DecideInput interface)
- Modify: `src/engine/decideForCharacter.ts:188-216` (inlined prompt)

- [ ] **Step 1: Rename `characterBlock` → export `buildCharacterStaticBlock`**

In `src/llm/prompt.ts`, change function declaration (line 629):

```typescript
export function buildCharacterStaticBlock(
  character: Character,
  nodes: MapNode[],
  sleepWindow: SleepWindow,
): string {
  const lines: string[] = [
    "你的自我认知：",
    // removed "名字" line — it's in the identity anchor now
    `- 年龄：${character.age} 岁`,
    `- 性别：${character.gender === "male" ? "男" : character.gender === "female" ? "女" : "其他"}`,
    `- 身份：${PROFESSION_LABELS[character.profession] ?? character.profession}`,
  ];
  if (character.expenseExempt) {
    lines.push("- 生存开销：免单（未成年人或全包游客）");
  } else {
    lines.push("- 生存开销：吃饭 15💰/次，洗澡 10💰/次");
  }
  lines.push(`- 当前持有：${character.money} 金钱`);
  const actNode = character.activityNodeId
    ? nodes.find((n) => n.id === character.activityNodeId)
    : undefined;
  const restNode = character.restNodeId
    ? nodes.find((n) => n.id === character.restNodeId)
    : undefined;
  if (actNode) {
    lines.push(`- 你的活动处：${actNode.name} [${actNode.id}]`);
  }
  if (restNode) {
    lines.push(`- 你的休息处：${restNode.name} [${restNode.id}]`);
  }
  lines.push(`- 作息窗口：${formatSleepWindow(sleepWindow)}`);
  lines.push(`- 生平简介：${character.biography}`);
  lines.push("- 性格特征（用文字描述，**禁止在 reasoning 里写数值**）：");
  for (const s of describePersonality(character.personality)) {
    lines.push(`  · ${s}`);
  }
  lines.push(
    character.abilities.length > 0
      ? `- 能力：${character.abilities.map((a) => `${a.kind}(tier ${a.tier})`).join("、")}`
      : "- 能力：（无值得一提的特殊能力）",
  );
  return lines.join("\n");
}
```

- [ ] **Step 2: Remove characterBlock from `buildSystemPrompt`**

Replace `buildSystemPrompt` (lines 845-863):

```typescript
export function buildSystemPrompt(args: {
  character: Character;
  worldName: string;
  nodes: MapNode[];
  language?: Language;
}): string {
  const { worldName, nodes } = args;
  const language = args.language ?? "zh";

  // system prompt 只含所有 NPC 共享的内容 → 100% prompt cache 命中
  const lines: string[] = [worldRules(), "", `你身处的世界：${worldName}。`];
  const mapGraph = describeMapGraph(nodes);
  if (mapGraph) lines.push("", mapGraph);
  lines.push("", languageInstruction(language));
  return lines.join("\n");
}
```

Update the import list: remove `formatSleepWindow` and `DEFAULT_SLEEP_WINDOW` from `buildSystemPrompt`'s usage (they're still used elsewhere, just no longer needed here).

- [ ] **Step 3: Add identity anchor + static block to start of `buildUserPrompt`**

Add new parameter and insert at the beginning of `buildUserPrompt` body. Update the function signature (line 915-925):

```typescript
export function buildUserPrompt(args: {
  character: Character;
  here: MapNode;
  companions: Character[];
  perceived: WorldEvent[];
  options: ActionOption[];
  tick: number;
  facts: AggregatedFacts;
  language?: Language;
  arrivalIntro?: boolean;
  allCharacters?: Character[];
}): string {
  const { character, here, companions, perceived, options, tick, facts, allCharacters } = args;
  const language = args.language ?? "zh";
  const sleepWindow = character.sleepWindow ?? DEFAULT_SLEEP_WINDOW;
  const t = timeOfDay(tick, sleepWindow);
  const fatigue = qualifyVital(character.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(character.vitals.hunger, "hunger");
  const hygiene = qualifyVital(character.vitals.hygiene, "hygiene");

  const lines: string[] = [];

  // 0. 身份锚点 —— user prompt 的第一行
  const profLabel = PROFESSION_LABELS[character.profession] ?? character.profession;
  const nameMap = new Map<string, string>();
  if (allCharacters) {
    for (const ac of allCharacters) nameMap.set(ac.id, ac.name);
  }
  for (const c of companions) nameMap.set(c.id, c.name);

  const workplaceParts: string[] = [];
  for (const [targetId, rel] of Object.entries(character.relations)) {
    const targetName = nameMap.get(targetId) ?? targetId;
    if (rel.kinds.includes("boss")) workplaceParts.push(`${targetName}是你的老板`);
    if (rel.kinds.includes("subordinate")) workplaceParts.push(`${targetName}是你的下属`);
    if (rel.kinds.includes("colleague")) workplaceParts.push(`${targetName}是你的同事`);
  }

  lines.push(`你是${character.name}，${character.age}岁的${profLabel}。`);
  if (workplaceParts.length > 0) {
    lines.push(workplaceParts.join("；") + "。");
  }
  lines.push("");

  // 0.5. 角色静态认知（原 system prompt characterBlock）
  lines.push(buildCharacterStaticBlock(character, nodes, sleepWindow));
  lines.push("");

  // 1. 时间 + 作息引导
  lines.push(
    `当前时间：第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:00（${t.period}${t.isSleepHour ? "，已是你的作息时段" : ""}）。tick=${tick}`,
  );
  // ... rest of the function continues as before (sections 2-14)
```

- [ ] **Step 4: Add `allCharacters` to `DecideInput` in tick.ts**

In `src/engine/tick.ts`, find the `DecideInput` interface (~line 65) and add:

```typescript
export interface DecideInput {
  character: Character;
  nodes: MapNode[];
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  perceived: WorldEvent[];
  options: ActionOption[];
  worldName: string;
  tick: number;
  facts: AggregatedFacts;
  language: Language;
  ctx: ActionContext;
  allCharacters: Character[];  // for identity anchor name resolution
}
```

Then at the `decideFn` call site (~line 502), add `allCharacters: loaded.characters`:

```typescript
        action = await decideFn({
          character: c,
          nodes,
          here: ctx.here,
          companions: ctx.companions,
          reachable: ctx.reachable,
          perceived: perceptions.get(c.id) ?? [],
          options: opts,
          worldName: world.name,
          tick: fromTick,
          facts,
          language,
          ctx,
          allCharacters: loaded.characters,
        });
```

- [ ] **Step 5: Update `callLLM` in `decide.ts` to pass `allCharacters`**

In `src/llm/decide.ts`, `callLLM` function (~line 130):

```typescript
  const user = buildUserPrompt({
    character: input.character,
    here: input.here,
    companions: input.companions,
    perceived: input.perceived,
    options: input.options,
    tick: input.tick,
    facts: input.facts,
    language: input.language,
    allCharacters: (input as any).allCharacters,
  });
```

- [ ] **Step 6: Update `decideForCharacter.ts`**

In `src/engine/decideForCharacter.ts`, the `buildUserPrompt` call (~line 194):

```typescript
        const user = buildUserPrompt({
          character: c,
          here: ctx.here,
          companions: ctx.companions,
          perceived,
          options: opts,
          tick: fromTick,
          facts,
          language,
          arrivalIntro: true,
          allCharacters: characters,
        });
```

Also update the `buildSystemPrompt` call to match the new signature (it still works since `character` is still accepted but ignored).

- [ ] **Step 7: Run existing tests**

```bash
npx vitest run src/llm/prompt.test.ts src/engine/tick.test.ts
```

Check for test failures from changed prompt format. Update any assertions that depend on the old characterBlock location or companion display format.

- [ ] **Step 8: Commit**

```bash
git add src/llm/prompt.ts src/llm/decide.ts src/engine/tick.ts src/engine/decideForCharacter.ts
git commit -m "feat: move characterBlock to user prompt, add identity anchor"
```

---

### Task 3: Short memory dedup + limit reduction

**Files:**
- Modify: `src/llm/prompt.ts:30` (SHORT_MEMORY_LIMIT)
- Modify: `src/llm/prompt.ts:184-202` (describeMemoryTiers short memory section)

- [ ] **Step 1: Reduce limit + add consecutive dedup**

Change line 30:
```typescript
const SHORT_MEMORY_LIMIT = 4;
```

Replace the short memory display in `describeMemoryTiers` (lines 191-202):

```typescript
  // 短期记忆
  const filteredShort = short.filter((m) => !m.content.includes("[heuristic]"));
  // Remove exact consecutive duplicates
  const deduped: Memory[] = [];
  for (let i = 0; i < filteredShort.length; i++) {
    if (i > 0 && filteredShort[i].content === filteredShort[i - 1].content) continue;
    deduped.push(filteredShort[i]);
  }
  const recentShort = deduped.slice(-SHORT_MEMORY_LIMIT);
  lines.push("你的近期短期记忆：");
  if (recentShort.length === 0) {
    lines.push("（暂无）");
  } else {
    for (const m of recentShort) {
      lines.push(`- t=${m.tick}: ${m.content}`);
    }
  }
  lines.push("");
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: reduce short memory to 4, dedup consecutive identical entries"
```

---

### Task 4: Fix `arrival_action.action_type` prefix bug

**Files:**
- Modify: `src/engine/tick.ts:140-174` (handleOngoingMove)
- Modify: `src/engine/tick.ts:557-574` (immediate arrival path)
- Modify: `src/llm/decide.ts:152-173` (payloadToAction)

- [ ] **Step 1: Add normalize helper and fix `handleOngoingMove`**

In `src/engine/tick.ts`, add before `handleOngoingMove` (line 139):

```typescript
/** Strip "action_" prefix if present (LLM sometimes returns tool names as action types). */
function normalizeActionType(t: string): string {
  if (t.startsWith("action_")) return t.slice("action_".length);
  return t;
}
```

In `handleOngoingMove`, line 158:

```typescript
    const arrivalType = normalizeActionType(ca.arrivalAction?.type ?? "wait");
```

- [ ] **Step 2: Fix immediate arrival path**

In the `path.length <= 2` branch (line 560):

```typescript
          if (path.length <= 2) {
            c.currentAction = undefined;
            const arrivalType = normalizeActionType(action.arrivalAction?.type ?? "wait");
            action = {
              type: arrivalType,
              // ... rest unchanged
            };
```

- [ ] **Step 3: Fix `payloadToAction` in decide.ts**

In `payloadToAction`, line 164:

```typescript
    arrivalAction: p.arrival_action
      ? {
          type: p.arrival_action.action_type?.startsWith("action_")
            ? p.arrival_action.action_type.slice("action_".length)
            : p.arrival_action.action_type,
          freeText: p.arrival_action.free_text,
          targetId: p.arrival_action.target_id,
          targetNodeId: p.arrival_action.target_node_id,
        }
      : undefined,
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/tick.ts src/llm/decide.ts
git commit -m "fix: normalize arrival_action.action_type to strip action_ prefix"
```

---

### Task 5: Simplify move/speak action hints

**Files:**
- Modify: `src/engine/actions-builtin.ts:267-289` (moveAction.hint)
- Modify: `src/engine/actions-builtin.ts:186-201` (speakAction.hint)

- [ ] **Step 1: Simplify `moveAction.hint`**

Replace the entire `hint` function (lines 267-289):

```typescript
  hint(ctx) {
    const entries: Array<{ hint: string; targetNodeId?: string }> = [];
    const fatigueUrgent = ctx.self.vitals.fatigue >= 12;
    const hungerUrgent = ctx.self.vitals.hunger >= 10;
    const hygieneUrgent = ctx.self.vitals.hygiene >= 13;

    if (fatigueUrgent && ctx.facts.restNodeId) {
      entries.push({ hint: `⭐ 回休息处休息`, targetNodeId: ctx.facts.restNodeId });
    }
    if (hungerUrgent) {
      for (const n of ctx.reachable) {
        if (n.tags.includes("dining")) {
          entries.push({ hint: `⭐ 去 ${n.name} 用餐`, targetNodeId: n.id });
          break;
        }
      }
    }
    if (hygieneUrgent) {
      for (const n of ctx.reachable) {
        if (n.tags.includes("bathing")) {
          entries.push({ hint: `⭐ 去 ${n.name} 洗浴`, targetNodeId: n.id });
          break;
        }
      }
    }

    entries.push({ hint: "前往地图上任意地点（在 reasoning 中说清楚你为什么要去那里）" });
    return entries;
  },
```

- [ ] **Step 2: Simplify `speakAction.hint`**

Replace the current `hint` method (lines 186-201). Keep per-companion hints for target_id metadata but make them concise:

```typescript
  hint(ctx) {
    if (ctx.companions.length === 0) return "（没有可以说话的人）";
    return ctx.companions.map((c) => ({
      hint: `和 ${c.name} 交谈`,
      targetId: c.id,
    }));
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/actions-builtin.ts
git commit -m "feat: simplify move/speak hints — purpose-driven move, concise speak"
```

---

### Task 6: Remove duplicate move initiation memory

**Files:**
- Modify: `src/engine/tick.ts:538` (remove `pushMoveInitMemory` call)

- [ ] **Step 1: Remove the `pushMoveInitMemory` call**

At line 537-538 in tick.ts, remove:
```typescript
          // Write move initiation memory
          pushMoveInitMemory(c, fromTick, action, targetNode?.name ?? action.targetNodeId);
```

The "开始前往" memory from the multi-step wait action (line 580) already serves as the movement initiation memory. For path <= 2 (immediate arrival), the arrival action memory is sufficient — there's no travel period to be interrupted.

Also mark the `pushMoveInitMemory` function as unused — it can be deleted, or kept for potential mod use. For cleanliness, delete it (lines 190-206):

```typescript
// DELETE this function block (lines 190-206):
function pushMoveInitMemory(
  c: Character,
  tick: number,
  action: Action,
  targetNodeName: string,
): void {
  const content = `${c.name} 前往 ${targetNodeName} ${action.reason ?? ""}`.trim();
  c.shortMemory.push({...});
  ...
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run src/engine/tick.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/tick.ts
git commit -m "fix: remove duplicate move initiation memory"
```

---

### Task 7: Integration verification

**Files:**
- Check: `src/llm/prompt.test.ts` (update any stale assertions)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

- [ ] **Step 2: Fix any broken tests — update prompt test assertions**

Check `src/llm/prompt.test.ts` for assertions that reference:
- characterBlock in system prompt (now in user prompt)
- Companion display format (changed from `（kinds, affection）` to `—— kinds，affection`)

Update any test expectations accordingly.

- [ ] **Step 3: Final commit if tests needed updates**

```bash
git add src/llm/prompt.test.ts
git commit -m "test: update prompt tests for context restructuring"
```
