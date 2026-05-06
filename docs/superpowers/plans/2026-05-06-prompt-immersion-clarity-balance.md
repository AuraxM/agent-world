# Prompt Immersion-Clarity Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split prompt responsibilities — worldRules for pure immersion, triggerHint + paramRule for precision — so LLM outputs remain natural while tool-calling accuracy recovers.

**Architecture:** Replace `guidance` on ActionDefinition with two new fields (`triggerHint`, `paramRule`), rewrite `worldRules()` as pure roleplay, and insert hint/rule blocks in the user prompt. The same action name appears in both blocks for LLM association reinforcement.

**Tech Stack:** TypeScript, Zod, Node.js test runner

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/domain/action-system.ts` | `ActionDefinition` interface (add `triggerHint`, `paramRule`, remove `guidance`); `ActionOption` (remove `guidance`); `buildOptions()` |
| `src/engine/actions-builtin.ts` | 10 built-in action definitions — add `triggerHint`/`paramRule`, remove `guidance` |
| `src/llm/prompt.ts` | `worldRules()` rewrite; `describeOptions()` simplify; new `describeHints()`/`describeRules()`; user prompt assembly |
| `src/llm/prompt.test.ts` | Update tests for worldRules, describeOptions, new functions |
| `configs/maps/sakuraba-academy/actions.js` | 3 mod actions (kiss/caress/hug) — sync field changes |
| `.claude/skills/agent-world-mod/references/action-system.md` | Update ActionDefinition reference docs |
| `.claude/skills/agent-world-mod/SKILL.md` | Update action creation guidance and Track C workflow |

---

### Task 1: Update ActionDefinition and ActionOption interfaces

**Files:**
- Modify: `src/domain/action-system.ts:70-110,137-151`

- [ ] **Step 1: Remove `guidance` from ActionOption and ActionDefinition, add triggerHint + paramRule**

In `src/domain/action-system.ts`, change `ActionOption` (lines 70-77):

```typescript
// ActionOption: presented to LLM
export interface ActionOption {
  type: string;
  hint: string;
  targetId?: string;
  targetNodeId?: string;
}
```

Change `ActionDefinition` (lines 79-110), replacing `guidance?` with `triggerHint` and `paramRule`:

```typescript
export interface ActionDefinition {
  type: string;
  duration: "instant" | number;

  check(ctx: ActionContext): boolean;
  hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;

  execute(ctx: ActionContext, input: ActionInput): Outcome;

  /** 校验 LLM 提供的参数。返回 null 表示合法，否则返回错误信息字符串。 */
  validateParams?(input: ActionInput, ctx: ActionContext): string | null;

  onTick?(ctx: ActionContext): Outcome | null;
  onComplete?(ctx: ActionContext): Outcome;
  onInterrupt?(ctx: ActionContext, reason: string): Outcome;

  /** 专属 tool 参数 JSON Schema properties。 */
  extraParams?: Record<string, unknown>;
  /** extraParams 中必填字段名列表。 */
  extraRequired?: string[];

  /** 是否可在对话中发起。仅 instant 类 action 可设 true。 */
  usableInDialogue?: boolean;

  /** 一句话描述什么时候该用这个 action（出现在 user prompt 的"你此刻能做的事"块）。 */
  triggerHint: string;
  /** 一句话参数说明 + 使用条件。必填/可选/无需 三档明确。出现在 user prompt 的"调用规则"块。 */
  paramRule: string;
}
```

- [ ] **Step 2: Update `buildOptions()` to drop `guidance`**

In `buildOptions()` (lines 137-151), remove all `guidance: def.guidance` references:

```typescript
buildOptions(ctx: ActionContext): ActionOption[] {
  const opts: ActionOption[] = [];
  for (const [type, def] of this._defs) {
    if (!def.check(ctx)) continue;
    const hint = def.hint(ctx);
    if (Array.isArray(hint)) {
      for (const h of hint) {
        opts.push({ type, hint: h.hint, targetId: h.targetId, targetNodeId: h.targetNodeId });
      }
    } else {
      opts.push({ type, hint });
    }
  }
  return opts;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit src/domain/action-system.ts
```

Expected: errors only from downstream files still referencing `guidance` (actions-builtin.ts, prompt.ts, sakuraba actions.js, etc.). No errors within action-system.ts itself.

- [ ] **Step 4: Commit**

```bash
git add src/domain/action-system.ts
git commit -m "refactor: replace guidance with triggerHint + paramRule on ActionDefinition"
```

---

### Task 2: Update 10 built-in actions

**Files:**
- Modify: `src/engine/actions-builtin.ts:1-450`

- [ ] **Step 1: Replace `guidance` with `triggerHint` + `paramRule` on all 10 actions**

The file exports 10 actions. For each, remove the `guidance:` line and add `triggerHint:` and `paramRule:` lines. The full replacements:

**eatAction** (line ~10):
```typescript
// Remove: guidance: "饥饿时进食以维持生存，优先于社交",
// Add:
triggerHint: "感到饥饿时使用，补充能量维持身体运转。",
paramRule: "可选 free_text。需在餐厅/食堂类地点。",
```

**batheAction** (line ~48):
```typescript
// Remove: guidance: "卫生值高时洗浴保持清洁",
// Add:
triggerHint: "感觉身体不干净时使用，保持个人卫生。",
paramRule: "可选 free_text。需在浴室/洗浴类地点。",
```

**restAction** (line ~85):
```typescript
// Remove: guidance: "非睡眠时段疲惫时休息恢复体力",
// Add:
triggerHint: "疲惫但不在睡眠时段时使用，在住处或隐私空间短暂休息。",
paramRule: "无需额外参数。持续 5 ticks，可被打断。",
```

**workAction** (line ~127):
```typescript
// Remove: guidance: "在工作地点获取收入，通常每个白天工作若干次",
// Add:
triggerHint: "在工作/学习地点、该干活时使用，赚取收入。",
paramRule: "可选 free_text。需在个人的活动节点。持续 5 ticks。",
```

**thinkAction** (line ~180):
```typescript
// Remove: guidance: "社交满足不想说话或需要整理思绪时，独自沉思回顾记忆、整理印象",
// Add:
triggerHint: "想一个人静静、回顾记忆整理思绪时使用。",
paramRule: "可选 free_text（思考内容，越具体记忆质量越高）。",
```

**speakAction** (line ~204):
```typescript
// Remove: guidance: "身边有人时发起社交对话",
// Add:
triggerHint: "身边有人、想发起对话交流时使用。",
paramRule: "必填 target_id（说话对象）+ free_text（说什么）。",
```

**sleepAction** (line ~242):
```typescript
// Remove: guidance: "作息窗口内回住所睡觉恢复疲劳，除非有强烈理由否则不应打破作息",
// Add:
triggerHint: "进入作息窗口、该睡觉时使用，完成整段睡眠恢复精力。",
paramRule: "无需额外参数。仅作息窗口内可用，需在住处。",
```

**moveAction** (line ~297):
```typescript
// Remove: guidance: "需要改变位置时移动到目标节点（如回家休息、去餐馆吃饭、去工作地点）",
// Add:
triggerHint: "想要移动时使用。",
paramRule: "必填 target_node_id（目的地 ID，在地图中查找）+ reason（移动原因）。可选 arrival_action。",
```

**giveAction** (line ~374):
```typescript
// Remove: guidance: "身边有人向你求助、借钱或表达经济困难时给予金钱帮助",
// Add:
triggerHint: "身边有人需要帮助，想给予金钱时使用。",
paramRule: "必填 target_id（给谁）+ amount（金额，正整数）。",
```

**lookAroundAction** (line ~428):
```typescript
// Remove: guidance: "当前没有合适的行动时原地观察等待（兜底选项）",
// Add:
triggerHint: "无事可做时四处看看。",
paramRule: "无需额外参数。始终可用，兜底选项。",
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors only from `src/llm/prompt.ts` (still referencing `guidance` on ActionOption). `actions-builtin.ts` should have zero new errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/actions-builtin.ts
git commit -m "refactor: replace guidance with triggerHint + paramRule on built-in actions"
```

---

### Task 3: Rewrite worldRules and update prompt functions

**Files:**
- Modify: `src/llm/prompt.ts:283-300,553-587,1388-1391`

- [ ] **Step 1: Rewrite `worldRules()`**

Replace lines 553-587 (`function worldRules(): string { ... }`) with:

```typescript
function worldRules(): string {
  return `你是这个小镇的居民。你每天在这里过日子——天亮了起床，饿了吃饭，困了睡觉，碰见熟人聊两句，一个人时也会发呆想心事。

你没有"玩家"这个概念。你活在你的身体里，能感觉到饿、困、脏、累。身体不舒服的时候，你会想办法让自己好受些——这是本能，不需要谁来提醒。

你做出的每个决定，都来自你的性格和当下的感受。性格决定了你的风格——有人喜欢热闹，有人偏爱独处；有人想到就做，有人反复掂量。但不管什么性格，饿了要吃、困了要睡——这些基本的需要，不会因为"不爱动弹"就不做了。

日子一天天过下去。你会记住让你在意的事，忘掉不重要的。遇见的人会和你产生关联，关系走动了才热络，不走动就淡了。

要做什么，调用 decide_action 工具来告诉世界。就像你抬起脚迈出一步那样自然。`;
}
```

- [ ] **Step 2: Add `describeHints()` and `describeRules()` functions**

Add after `describeOptions()` (after line 300). These are new functions:

```typescript
function describeHints(opts: ActionOption[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const o of opts) {
    if (seen.has(o.type)) continue;
    seen.add(o.type);
    const def = actionRegistry.get(o.type);
    if (def?.triggerHint) {
      lines.push(`**${o.type}**: ${def.triggerHint}`);
    }
  }
  return lines.join("\n");
}

function describeRules(opts: ActionOption[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const o of opts) {
    if (seen.has(o.type)) continue;
    seen.add(o.type);
    const def = actionRegistry.get(o.type);
    if (def?.paramRule) {
      lines.push(`**${o.type}**: ${def.paramRule}`);
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 3: Simplify `describeOptions()` — remove `【guidance】` append**

Replace lines 283-300 (the `describeOptions` function) with:

```typescript
function describeOptions(opts: ActionOption[]): string {
  return opts
    .map((o, i) => {
      const meta: string[] = [`type=${o.type}`];
      if (o.targetId) meta.push(`target_id=${o.targetId}`);
      if (o.targetNodeId) meta.push(`target_node_id=${o.targetNodeId}`);
      return `${i + 1}. (${meta.join(", ")}) ${o.hint}`;
    })
    .join("\n");
}
```

- [ ] **Step 4: Update user prompt assembly — replace lines 1388-1391**

Replace:
```typescript
  // 7. 可选行动
  lines.push("你现在可以选择的行动（每项已带类型与必要的 target id）：");
  lines.push(describeOptions(options));
  lines.push("");
```

With:
```typescript
  // 7. 可选行动
  lines.push("## 你此刻能做的事");
  lines.push(describeHints(options));
  lines.push("");
  lines.push("## 可选行动（每项已带类型与必要的 target id）");
  lines.push(describeOptions(options));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 调用规则（技术提示，不是叙事）");
  lines.push(describeRules(options));
  lines.push("");
```

- [ ] **Step 5: Verify TypeScript compiles with zero errors**

```bash
npx tsc --noEmit
```

Expected: zero errors. All `guidance` references should now be gone from the codebase.

- [ ] **Step 6: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: rewrite worldRules for immersion, add hint/rule layered prompt blocks"
```

---

### Task 4: Update prompt tests

**Files:**
- Modify: `src/llm/prompt.test.ts`

- [ ] **Step 1: Update `worldRules` snapshot / assertion**

Find any test that validates `worldRules()` output. Search for `worldRules` in the test file:

```bash
grep -n "worldRules" src/llm/prompt.test.ts
```

If there's a snapshot test, update the snapshot. If there's a substring assertion, update it to match the new text (e.g., assert the new text contains "你是这个小镇的居民" instead of old text).

- [ ] **Step 2: Update `describeOptions` tests**

Find tests for `describeOptions`. Remove any assertion that checks for `【guidance】` or `guidance` in the output. The new output should just be `N. (type=xxx) hint` without bracketed guidance.

- [ ] **Step 3: Add tests for `describeHints` and `describeRules`**

The functions are not exported (module-private), so test them indirectly through `buildUserPrompt` output. Add assertions:

```typescript
// In an existing or new test that calls buildUserPrompt:
test("buildUserPrompt includes hint and rule blocks", () => {
  const prompt = buildUserPrompt({ /* valid args with options */ });
  
  // Hint block
  assert(prompt.includes("## 你此刻能做的事"));
  assert(prompt.includes("**eat**: 感到饥饿时使用"));
  assert(prompt.includes("**speak**: 身边有人、想发起对话交流时使用。"));
  
  // Rule block
  assert(prompt.includes("## 调用规则（技术提示，不是叙事）"));
  assert(prompt.includes("**speak**: 必填 target_id（说话对象）+ free_text（说什么）。"));
  assert(prompt.includes("**move**: 必填 target_node_id（目的地 ID，在地图中查找）"));
  
  // Separator
  assert(prompt.includes("---"));
  
  // No old guidance bracket format
  assert(!prompt.includes("【"));
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/llm/prompt.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.test.ts
git commit -m "test: update prompt tests for hint/rule layered blocks"
```

---

### Task 5: Update sakuraba-academy mod actions

**Files:**
- Modify: `configs/maps/sakuraba-academy/actions.js`

- [ ] **Step 1: Replace `guidance` with `triggerHint` + `paramRule` on 3 actions**

**kissAction** (line ~6):
```javascript
// Remove: guidance: "情到深处、想给对方一个回应或安抚时，一个吻胜过千言万语",
// Add:
triggerHint: "情到深处，想给对方回应或安抚时使用——一个吻胜过千言万语。",
paramRule: "必填 target_id（亲吻对象）。仅在对话中可用。",
```

**caressAction** (line ~39):
```javascript
// Remove: guidance: "想安抚对方的情绪、表达无声的关心时，轻柔的触碰比语言更温柔",
// Add:
triggerHint: "想安抚对方情绪、表达无声的关心时使用——轻柔的触碰比语言更温柔。",
paramRule: "必填 target_id（抚摸对象）。仅在对话中可用。",
```

**hugAction** (line ~71):
```javascript
// Remove: guidance: "久别重逢、离别之际、或是对方难过时，一个拥抱能让人感到被在乎",
// Add:
triggerHint: "久别重逢、离别之际、或是对方难过时使用——一个拥抱让人感到被在乎。",
paramRule: "必填 target_id（拥抱对象）。仅在对话中可用。",
```

- [ ] **Step 2: Validate the actions file**

```bash
node -e "
const defs = require('./configs/maps/sakuraba-academy/actions.js');
const arr = Array.isArray(defs) ? defs : (defs.default || []);
for (const d of arr) {
  if (!d.triggerHint || !d.paramRule) {
    console.error('MISSING triggerHint or paramRule in:', d.type);
  } else if (d.guidance) {
    console.error('STALE guidance field in:', d.type);
  } else {
    console.log('OK:', d.type);
  }
}
"
```

Expected: all 3 actions OK.

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakuraba-academy/actions.js
git commit -m "refactor: replace guidance with triggerHint + paramRule on sakuraba actions"
```

---

### Task 6: Update agent-world-mod skill references

**Files:**
- Modify: `.claude/skills/agent-world-mod/references/action-system.md`
- Modify: `.claude/skills/agent-world-mod/SKILL.md`

- [ ] **Step 1: Update ActionDefinition in action-system.md**

In `references/action-system.md`, replace the ActionDefinition interface block (lines 9-27) with the updated interface:

```markdown
## ActionDefinition

The core descriptor for each registered action type. This is what you export from `actions.js`.

```typescript
interface ActionDefinition {
  type: string;                    // unique action type key (snake_case for mod actions)
  duration: "instant" | number;   // "instant" = resolves in one tick; number = ticks to complete

  check(ctx: ActionContext): boolean;
  hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;
  execute(ctx: ActionContext, input: ActionInput): Outcome;

  // Required for LLM prompt:
  triggerHint: string;             // one sentence: when to use this action ("在……时使用")
  paramRule: string;               // one sentence: parameter requirements + conditions. Use 必填/可选/无需

  // Optional:
  onTick?(ctx: ActionContext): Outcome | null;
  onComplete?(ctx: ActionContext): Outcome;
  onInterrupt?(ctx: ActionContext, reason: string): Outcome;
  extraParams?: Record<string, unknown>;
  extraRequired?: string[];
  usableInDialogue?: boolean;
}
```
```

Replace the `guidance` explanation section (lines 29-34) with:

```markdown
**`triggerHint`** (required): one sentence telling the LLM **when** to pick this action — the trigger condition, not what it does. Written in natural Chinese but information-dense. Use "在……时使用" sentence pattern. Examples:
- `eat`: "感到饥饿时使用，补充能量维持身体运转。"
- `speak`: "身边有人、想发起对话交流时使用。"
- Custom `brew_tea`: "想放松或招待客人时沏茶。"

**`paramRule`** (required): one sentence describing parameter requirements and usage conditions. Use exactly three tiers: `必填` (must provide), `可选` (may provide), `无需额外参数` (no extra params). Include location/time constraints after parameter listing. Examples:
- `speak`: "必填 target_id（说话对象）+ free_text（说什么）。"
- `eat`: "可选 free_text。需在餐厅/食堂类地点。"
- `sleep`: "无需额外参数。仅作息窗口内可用，需在住处。"

These two fields appear in the user prompt as paired blocks — hint block first, rule block second — with the same action name in bold (`**action**:`) for LLM association.
```

- [ ] **Step 2: Update SKILL.md Track C**

In `SKILL.md`, update the Track C "Hard invariants" section (around line 270-279) to include the new required fields:

Replace:
```
- `guidance?`: optional but recommended — short string telling the LLM **when** to pick this action
```

With:
```
- `triggerHint`: required string — one sentence telling the LLM **when** to pick this action. Use "在……时使用" pattern.
- `paramRule`: required string — one sentence of parameter requirements. Use 必填/可选/无需 tiers. Include location constraints.
```

Also add to the validation script in Track C workflow (around line 255-267). Update the validation check to verify `triggerHint` and `paramRule` exist:

```bash
node -e "
const defs = require('./configs/maps/<pack-id>/actions.js');
const arr = Array.isArray(defs) ? defs : (defs.default || []);
for (const d of arr) {
  if (!d.type || !d.duration || !d.check || !d.hint || !d.execute) {
    console.error('MISSING FIELD in:', d.type || JSON.stringify(d));
  } else if (!d.triggerHint) {
    console.error('MISSING triggerHint in:', d.type);
  } else if (!d.paramRule) {
    console.error('MISSING paramRule in:', d.type);
  } else {
    console.log('OK:', d.type, '(' + d.duration + ')');
  }
}
console.log('Total:', arr.length, 'actions');
"
```

Also add a new "guidance → triggerHint/paramRule migration" note in Track C workflow step 3:

```
3. **Draft** following `references/action-system.md`. Use `triggerHint` (when to use, "在……时使用" pattern) and `paramRule` (parameter requirements, 必填/可选/无需 tiers). Do NOT use the deprecated `guidance` field.
```

- [ ] **Step 3: Verify skill files are valid markdown**

```bash
head -5 .claude/skills/agent-world-mod/SKILL.md
head -5 .claude/skills/agent-world-mod/references/action-system.md
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/agent-world-mod/
git commit -m "docs: update agent-world-mod skill for triggerHint + paramRule convention"
```

---

### Task 7: Full integration verification

- [ ] **Step 1: TypeScript full build**

```bash
npx tsc --noEmit
```

Expected: zero errors across the entire project.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass, no regressions.

- [ ] **Step 3: Run a few simulation ticks manually**

```bash
# Start the dev server and run 3-5 ticks, verify:
# 1. NPCs still make sensible decisions
# 2. LLM calls include correct parameters (spot-check speak has target_id, move has target_node_id)
# 3. No guidance-related errors in server logs
```

- [ ] **Step 4: Check worldRules is being used correctly**

Grep server logs or add a temporary debug log to verify the new `worldRules()` text appears in the system prompt and the new hint/rule blocks appear in the user prompt.

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: integration fixes for hint/rule layered prompt"
```
