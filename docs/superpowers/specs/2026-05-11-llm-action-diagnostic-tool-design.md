# LLM Action Diagnostic Tool — Design Spec

## Problem

When adding a new action, the LLM sometimes never calls it. The developer cannot determine whether:

- The action is missing from the prompt / tool descriptions
- The code path (`check()`, `buildOptions`, `decide_action` tool) is broken
- The LLM sees the action but chooses not to use it

This tool provides a definitive answer by running a single-action diagnostic against the real LLM and reporting exactly what happened at each stage.

## Scope

### Tested actions (15 built-in only)

| # | Action | decide | dialog | think | placement |
|---|--------|--------|--------|-------|-----------|
| 1 | `eat` | ✅ | — | — | ✅ |
| 2 | `bathe` | ✅ | — | — | ✅ |
| 3 | `rest` | ✅ | — | — | ✅ |
| 4 | `work` | ✅ | — | — | ✅ |
| 5 | `think` | ✅ | — | — | ✅ |
| 6 | `chat` | ✅ | — | — | — |
| 7 | `sleep` | ✅ | — | — | — |
| 8 | `move` | ✅ | — | — | ✅ |
| 9 | `look_around` | ✅ | — | — | ✅ |
| 10 | `buy` | ✅ | — | — | — |
| 11 | `use_item` | ✅ | — | — | — |
| 12 | `give` | — | ✅ | — | — |
| 13 | `give_item` | — | ✅ | — | — |
| 14 | `travel_together` | — | ✅ | — | — |
| 15 | `manage_employment` | — | ✅ | — | — |

### Tested LLM entry points (all 7)

| Entry | Tool called |
|-------|------------|
| `decide` | `decide_action` |
| `dialog` | `submit_dialog_turn`, `propose_dialogue_action`, `respond_to_dialogue_action` |
| `think` | `submit_think_turn`, `end_thinking` |
| `accept` | `submit_accept_decision` |
| `summary` | `submit_dialog_summary` |
| `memory` | `submit_personal_memory` |
| `placement` | `action_<type>` (per-action tools) |

### Tested auxiliary tools (all entries)

`recall`, `memorize`, `view_map`, `add_notebook_entry`, `update_likes`, `update_goals`, `update_relation`

### Non-scope

- Mod actions (test the built-in ones; mod actions follow the same pattern)
- Batch pass/fail regression mode (future enhancement)

## Design

### File

```
backend/scripts/diagnose-action.ts
```

### Run command

```bash
cd backend && npx tsx scripts/diagnose-action.ts \
  --action <type> \
  --entry <entry>

# Optional flags
--character <id>     # Default: auto-select
--scene <dir>        # Default: AGENT_WORLD_SCENES_DIR
--provider <name>    # Default: DB config for entry
--timeout <ms>       # Default: 60000
--verbose            # Always on by default
--all                # Run ALL action+entry combos and emit summary table
```

### Execution flow

```
1. Parse CLI args
2. Load .env, init DB connection, load scene, register built-in actions
3. Validate target action exists and is valid for the entry
4. Look up induction profile from the preset table
5. Select a character (existing or temp) that matches the profile
6. OPEN DB TRANSACTION
   a. Write induction state (vitals, emotions, location, wallet, companions, etc.)
   b. Call the real LLM function (llmDecide / llmDialogTurn / llmThink / etc.)
   c. Capture full prompt, full response, timing
   d. ROLLBACK transaction (no permanent state changes)
7. Print diagnostic report to stdout
```

### Induction profiles (state construction)

Each action has a preset profile. The script injects state directly into the DB via Drizzle within a transaction that always rolls back.

```typescript
interface InductionProfile {
  vitals?: { hunger?: number; fatigue?: number; hygiene?: number };
  emotions?: { mood?: number; stress?: number; socialSatiety?: number };
  locationTag?: string;
  locationPrivacy?: "public" | "private";
  companionFilter?: {
    relationKind?: string;
    minAffinity?: number;
    sameLocation?: boolean;
  };
  money?: number;
  inventory?: string[];
  employment?: boolean;
  isSleepHour?: boolean;
  notebookEntry?: { hour: number; text: string };
}

type EntryStrategy =
  | { kind: "decide"; profile: InductionProfile }
  | { kind: "dialog"; profile: InductionProfile; dialogueHistory: string[] }
  | { kind: "think"; profile: InductionProfile }
  | { kind: "accept"; profile: InductionProfile; inviterId: string }
  | { kind: "summary"; dialogueHistory: string[] }
  | { kind: "memory"; dialogueHistory: string[] }
  | { kind: "placement"; profile: InductionProfile };
```

### Diagnostic report format

```
══╡ 诊断报告：action=kiss, entry=dialog ╞══════════════════════════════

┌─ 1. 代码链路检查 ──────────────────────────────────────────────────┐
│ ✅ ActionRegistry: "kiss" 已注册 (来源: okinawa-trip/actions.js)     │
│ ✅ check() 返回值: true                                              │
│ ✅ buildOptions 中可见: 否 → ⚠️ 对话 action，仅出现在 dialog 入口    │
│ ✅ 对话 action 列表: "kiss" 已包含                                   │
│ ✅ propose_dialogue_action 工具: 已注入                              │
└────────────────────────────────────────────────────────────────────┘

┌─ 2. 诱导状态摘要 ───────────────────────────────────────────────────┐
│ 角色: 花子 (char_002), 位置: 海边民宿 (私人)                         │
│ 同伴: 太郎 (char_001) — 恋人，好感度 85                              │
│ 情绪: 心情 8/10 · 压力 2/10 · 社交满足 5/10                          │
│ 对话历史: 3 条（最后一条: "太郎：花子...你真美。"）                   │
└────────────────────────────────────────────────────────────────────┘

┌─ 3. LLM 响应 ───────────────────────────────────────────────────────┐
│ 模型: deepseek-chat, 耗时: 2.3s, 轮次: 1/3                           │
│ LLM 调用的工具:                                                       │
│   • submit_dialog_turn (line="太郎...我也有同样的感觉")                │
│   • propose_dialogue_action (action_type="kiss", target_id="char_001") │
│ 🟢 判定: 目标 action "kiss" 被正确调用！                              │
└────────────────────────────────────────────────────────────────────┘

┌─ 4. 完整 Prompt (默认展开) ─────────────────────────────────────────┐
│ System prompt / User prompt / Tools JSON / Raw API response          │
└────────────────────────────────────────────────────────────────────┘
```

**Failure modes:**

- `❌ buildOptions 中不可见` → `check()` returned false — reports the failing condition
- `❌ decide_action enum 缺失` → tool not injected — code path bug
- `🔴 LLM 未选择` → prompt visible but LLM chose something else → induction too weak

### Skill integration

After the script is implemented, create a skill `agent-world-action-test` (already exists — update it) or a new skill so that:
- "帮我测一下 eat action" automatically runs the script with `--action eat --entry decide`
- "测试所有 action" runs with `--all`

## Key design decisions

1. **DB transaction + rollback**: No production code changes. All state injection is temporary.
2. **Real LLM calls**: No mocking. The point is to test the real LLM's response to real prompts.
3. **Preset induction profiles**: Each action gets a hand-crafted scene that naturally induces it. Profiles are defined in the script itself, not in config files.
4. **No prompt modification**: The system prompt and user prompt builders are called as-is. Induction is purely through game state.
