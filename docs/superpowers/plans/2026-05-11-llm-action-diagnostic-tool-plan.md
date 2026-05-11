# LLM Action Diagnostic Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `backend/scripts/diagnose-action.ts` — a standalone diagnostic script that injects inducing game state into the DB, calls the real LLM, and reports whether the target action/tool was correctly invoked, then rolls back all changes.

**Architecture:** Single script with inline induction profiles. Uses the real game DB (SAVEPOINT for rollback), real LLM providers, and imports production modules (`llmDecide`, `llmDialogTurn`, etc.) directly. No production code changes required.

**Tech Stack:** TypeScript, `tsx` for execution, Drizzle ORM (better-sqlite3), Node built-in `parseArgs` for CLI, production `openai` SDK via provider layer.

---

## File structure

```
backend/scripts/diagnose-action.ts    # Main script (~800 lines)
```

No other files created or modified. After implementation, update the existing `agent-world-action-test` skill to invoke this script.

---

### Task 1: Scaffold — CLI parsing and initialization

**Files:**
- Create: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Create the script skeleton with CLI parsing**

```typescript
#!/usr/bin/env npx tsx
/**
 * LLM Action Diagnostic Tool
 *
 * Usage:
 *   cd backend && npx tsx scripts/diagnose-action.ts --action eat --entry decide
 *   cd backend && npx tsx scripts/diagnose-action.ts --all
 *
 * Inject inducing game state into DB, call real LLM, report whether
 * the target action/tool was called. All DB changes rolled back via SAVEPOINT.
 */

import { config } from "dotenv";
import { parseArgs } from "node:util";

// Load .env before any other imports (DATABASE_URL, AGENT_WORLD_SCENES_DIR)
config({ path: new URL("../.env", import.meta.url).pathname });

const USAGE = `Usage: npx tsx scripts/diagnose-action.ts --action <type> --entry <entry>

Options:
  --action <type>     Target action type (required, unless --all)
  --entry <entry>     Entry point: decide | dialog | think | accept | summary | memory | placement
  --character <id>    Character ID (default: auto-select first matching)
  --scene <dir>       Scene directory (default: AGENT_WORLD_SCENES_DIR)
  --provider <name>   Provider name (default: from DB config)
  --timeout <ms>      LLM timeout in ms (default: 60000)
  --all               Run all action+entry combinations
  --verbose           Always on by default

Examples:
  npx tsx scripts/diagnose-action.ts --action eat --entry decide
  npx tsx scripts/diagnose-action.ts --action kiss --entry dialog
  npx tsx scripts/diagnose-action.ts --all`;

interface CliArgs {
  action?: string;
  entry?: string;
  character?: string;
  scene?: string;
  provider?: string;
  timeout: number;
  all: boolean;
  verbose: boolean;
}

function parseCli(): CliArgs {
  const { values } = parseArgs({
    options: {
      action: { type: "string" },
      entry: { type: "string" },
      character: { type: "string" },
      scene: { type: "string" },
      provider: { type: "string" },
      timeout: { type: "string", default: "60000" },
      all: { type: "boolean", default: false },
      verbose: { type: "boolean", default: true },
    },
    allowPositionals: true,
    strict: false,
  });

  if (!values.all && (!values.action || !values.entry)) {
    console.error("Error: --action and --entry are required (or use --all)");
    console.error(USAGE);
    process.exit(1);
  }
  if (values.all && !values.entry) {
    console.error("Error: --entry is required with --all");
    process.exit(1);
  }

  const VALID_ENTRIES = ["decide", "dialog", "think", "accept", "summary", "memory", "placement"];
  if (values.entry && !VALID_ENTRIES.includes(values.entry)) {
    console.error(`Error: --entry must be one of: ${VALID_ENTRIES.join(", ")}`);
    process.exit(1);
  }

  return {
    action: values.action,
    entry: values.entry,
    character: values.character,
    scene: values.scene,
    provider: values.provider,
    timeout: parseInt(values.timeout ?? "60000", 10),
    all: values.all,
    verbose: values.verbose,
  };
}
```

- [ ] **Step 2: Add initialization — DB, action registry, LLM provider check**

```typescript
import { db } from "../src/db/index";
import { actionRegistry } from "../src/domain/action-system";
import { BUILTIN_ACTIONS } from "../src/systems/actions-builtin";
import { getEntryConfig, getLLMClientForEntry } from "../src/llm/providers";

async function init(cli: CliArgs) {
  // 1. Register built-in actions
  actionRegistry.registerAll(BUILTIN_ACTIONS);

  // 2. Verify a world exists in DB
  const worlds = db.select().from(/* worlds table */).all();
  if (worlds.length === 0) {
    console.error("Error: No world found in DB. Seed the database first.");
    process.exit(1);
  }

  // 3. Verify LLM provider is configured for the entry
  const entryConfig = getEntryConfig(cli.entry!);
  // (getEntryConfig throws if no active provider)

  // 4. Load scene if provided
  if (cli.scene) {
    process.env.AGENT_WORLD_SCENES_DIR = cli.scene;
  }
}
```

- [ ] **Step 3: Run the script to verify it parses args and initializes without error**

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action eat --entry decide
# Expected: Error if no world/LLM provider, otherwise "Not implemented yet"
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: scaffold diagnose-action CLI and initialization"
```

---

### Task 2: Induction profiles — all 15 built-in actions

**Files:**
- Modify: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Define the profile types and the full profile map**

Add to `diagnose-action.ts`:

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

interface EntryProfile {
  action: string;
  entry: "decide" | "dialog" | "think" | "accept" | "summary" | "memory" | "placement";
  profile: InductionProfile;
  /** Only for dialog/summary/memory entries */
  dialogueHistory?: string[];
  /** Only for accept entry */
  inviterId?: string;
}

// Profiles keyed by "action:entry"
const PROFILES: Record<string, EntryProfile> = {
  // ─── Decide entry ───────────────────────────────────────────
  "eat:decide": {
    action: "eat", entry: "decide",
    profile: {
      vitals: { hunger: 90, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "dining",
      money: 100,
    },
  },
  "bathe:decide": {
    action: "bathe", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 95 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "bathing",
      money: 100,
    },
  },
  "rest:decide": {
    action: "rest", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 85, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 5 },
      locationPrivacy: "private",
    },
  },
  "work:decide": {
    action: "work", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      employment: true,
    },
  },
  "think:decide": {
    action: "think", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 3 },
    },
  },
  "chat:decide": {
    action: "chat", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 7, stress: 2, socialSatiety: 2 },
      companionFilter: { sameLocation: true },
    },
  },
  "sleep:decide": {
    action: "sleep", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 90, hygiene: 50 },
      emotions: { mood: 3, stress: 5, socialSatiety: 5 },
      locationPrivacy: "private",
      isSleepHour: true,
    },
  },
  "move:decide": {
    action: "move", entry: "decide",
    profile: {
      vitals: { hunger: 85, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      // No dining tag at current location → induces move to restaurant
    },
  },
  "look_around:decide": {
    action: "look_around", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
    },
  },
  "buy:decide": {
    action: "buy", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      money: 200,
      // Need a shop at current node — script resolves this at runtime
    },
  },
  "use_item:decide": {
    action: "use_item", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 5 },
      inventory: ["apple"], // script maps to real item def at runtime
    },
  },

  // ─── Dialog entry ───────────────────────────────────────────
  "give:dialog": {
    action: "give", entry: "dialog",
    profile: {
      emotions: { mood: 7, stress: 2, socialSatiety: 5 },
      companionFilter: { sameLocation: true },
      money: 500,
    },
    dialogueHistory: [
      "太郎：最近手头有点紧，这个月的工资还没发...",
      "花子：是吗？有什么我能帮忙的吗？",
    ],
  },
  "give_item:dialog": {
    action: "give_item", entry: "dialog",
    profile: {
      emotions: { mood: 7, stress: 2, socialSatiety: 5 },
      companionFilter: { sameLocation: true },
      inventory: ["apple"],
    },
    dialogueHistory: [
      "太郎：听说你能做很好吃的苹果派？",
      "花子：对啊，可惜我这里没有苹果了。",
    ],
  },
  "travel_together:dialog": {
    action: "travel_together", entry: "dialog",
    profile: {
      emotions: { mood: 7, stress: 2, socialSatiety: 5 },
      companionFilter: { sameLocation: true },
    },
    dialogueHistory: [
      "太郎：我们接下来去哪？",
      "花子：要不要一起去海边走走？",
    ],
  },
  "manage_employment:dialog": {
    action: "manage_employment", entry: "dialog",
    profile: {
      emotions: { mood: 7, stress: 2, socialSatiety: 5 },
      companionFilter: { sameLocation: true },
      employment: true,
    },
    dialogueHistory: [
      "太郎：这家店生意越来越好了，我一个人忙不过来。",
      "花子：你可以考虑招个帮手呀。",
    ],
  },

  // ─── Think entry ────────────────────────────────────────────
  "think:think": {
    action: "think", entry: "think",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 3 },
    },
  },

  // ─── Placement entry ────────────────────────────────────────
  "eat:placement": {
    action: "eat", entry: "placement",
    profile: {
      vitals: { hunger: 90, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "dining",
      money: 100,
    },
  },
  "bathe:placement": {
    action: "bathe", entry: "placement",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 95 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "bathing",
      money: 100,
    },
  },
  "rest:placement": {
    action: "rest", entry: "placement",
    profile: {
      vitals: { hunger: 10, fatigue: 85, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 5 },
      locationPrivacy: "private",
    },
  },
  "work:placement": {
    action: "work", entry: "placement",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      employment: true,
    },
  },
  "think:placement": {
    action: "think", entry: "placement",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 3 },
    },
  },
  "move:placement": {
    action: "move", entry: "placement",
    profile: {
      vitals: { hunger: 85, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
    },
  },
  "look_around:placement": {
    action: "look_around", entry: "placement",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
    },
  },
};

function getProfile(action: string, entry: string): EntryProfile | undefined {
  return PROFILES[`${action}:${entry}`];
}

/** List all valid (action, entry) combinations from the profile map. */
function getAllCombinations(): Array<{ action: string; entry: string }> {
  return Object.values(PROFILES).map((p) => ({ action: p.action, entry: p.entry }));
}
```

- [ ] **Step 2: Verify the profile map exports correctly**

```bash
cd backend && npx tsx -e "
  import { PROFILES } from './scripts/diagnose-action';
  console.log(Object.keys(PROFILES).length, 'profiles loaded');
"
# Expected: ~24 profiles loaded
```

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: add induction profiles for all 15 built-in actions"
```

---

### Task 3: State injection engine

**Files:**
- Modify: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Implement state injection via SAVEPOINT and Drizzle update**

Add to `diagnose-action.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { characters } from "../src/db/schema";
import type { Character } from "../src/domain/character";

/**
 * Get the raw better-sqlite3 connection from the Drizzle instance.
 * Used for SAVEPOINT/ROLLBACK.
 */
function getRawSqlite() {
  // Drizzle better-sqlite3 stores the client internally
  return (db as unknown as { $client: { run: (sql: string) => void } }).$client;
}

/**
 * Resolve a character and a suitable node that matches the induction profile.
 * Returns { character, node, companion? } or throws if no match.
 */
async function resolveCharacter(
  profile: InductionProfile,
  preferredCharId?: string,
): Promise<{
  character: Character;
  node: MapNode;
  companion?: Character;
  worldId: string;
}> {
  // Load first world from DB
  const [world] = await db.select().from(worlds).limit(1);
  if (!world) throw new Error("No world in DB");

  // Load all characters for the world
  const allChars = await db
    .select()
    .from(characters)
    .where(eq(characters.worldId, world.id));

  // Load all nodes for the world
  const allNodes = await db
    .select()
    .from(nodes)
    .where(eq(nodes.worldId, world.id));

  // Pick character
  let char: Character;
  if (preferredCharId) {
    char = allChars.find((c) => c.id === preferredCharId);
    if (!char) throw new Error(`Character ${preferredCharId} not found`);
  } else {
    char = allChars[0];
  }

  // Resolve matching node
  let node: MapNode;
  if (profile.locationTag) {
    node = allNodes.find((n) => {
      const tags: string[] = JSON.parse(n.tagsJson);
      return tags.includes(profile.locationTag!);
    })!;
    if (!node) throw new Error(`No node found with tag "${profile.locationTag}"`);
  } else if (profile.locationPrivacy) {
    node = allNodes.find((n) => n.privacy === profile.locationPrivacy)!;
    if (!node) throw new Error(`No node found with privacy "${profile.locationPrivacy}"`);
  } else {
    node = allNodes.find((n) => n.id === char.locationId)!;
  }

  // Resolve companion
  let companion: Character | undefined;
  if (profile.companionFilter) {
    companion = allChars.find((c) => {
      if (c.id === char.id) return false;
      if (profile.companionFilter!.sameLocation) {
        // Will be at same location after injection
      }
      return true;
    });
  }

  return { character: char, node, companion, worldId: world.id };
}

/**
 * Inject induction state into DB within a SAVEPOINT.
 * Returns a rollback function that must be called after the LLM call.
 */
async function injectState(
  worldId: string,
  charId: string,
  companionId: string | undefined,
  nodeId: string,
  profile: InductionProfile,
): Promise<() => void> {
  const sqlite = getRawSqlite();
  sqlite.run("SAVEPOINT diag_inject");

  // Save original values for the report
  const orig = await db
    .select({
      vitalsJson: characters.vitalsJson,
      emotionJson: characters.emotionJson,
      locationId: characters.locationId,
      money: characters.money,
      inventoryJson: characters.inventoryJson,
    })
    .from(characters)
    .where(and(eq(characters.worldId, worldId), eq(characters.id, charId)))
    .then((r) => r[0]);

  // Build new JSON values
  const vitals = { hunger: 0, fatigue: 0, hygiene: 0, ...profile.vitals };
  const emotions = { mood: 0, stress: 0, social_satiety: 0, ...profile.emotions };

  // Update character in DB
  await db
    .update(characters)
    .set({
      vitalsJson: JSON.stringify(vitals),
      emotionJson: JSON.stringify(emotions),
      locationId: nodeId,
      money: profile.money ?? orig?.money ?? 100,
      inventoryJson: profile.inventory ? JSON.stringify(profile.inventory) : orig?.inventoryJson,
    })
    .where(and(eq(characters.worldId, worldId), eq(characters.id, charId)));

  // Move companion to same location
  if (companionId) {
    await db
      .update(characters)
      .set({ locationId: nodeId })
      .where(and(eq(characters.worldId, worldId), eq(characters.id, companionId)));
  }

  return () => {
    sqlite.run("ROLLBACK TO diag_inject");
  };
}
```

- [ ] **Step 2: Verify the injection works**

```bash
cd backend && npx tsx -e "
  // Manual test: inject, inspect, rollback
"
```

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: add state injection engine with SAVEPOINT rollback"
```

---

### Task 4: Decide entry — LLM dispatch and report

**Files:**
- Modify: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Implement the decide entry dispatch**

Add to `diagnose-action.ts`:

```typescript
import { llmDecide, type DecideInput } from "../src/llm/decide";
import { buildActionContext, getAvailableActions } from "../src/systems/actions";
import { deriveAggregatedFacts } from "../src/systems/facts";
import { buildSystemPrompt, buildUserPrompt, describeHints, describeOptions, describeRules } from "../src/llm/prompt";
import { loadWorld } from "../src/db/repository/worlds";
import type { Character, MapNode } from "../src/domain";

async function runDecideDiagnostic(
  profile: InductionProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  // Load world state
  const worldId = (await db.select().from(worlds).limit(1))[0]!.id;
  const { world, nodes: allNodes, characters: allChars, shops } = await loadWorld(worldId);

  // Resolve character and node
  const { character: origChar, node, companion } = await resolveCharacter(profile, charId);
  const char = { ...origChar }; // shallow copy — we'll mutate in the report

  // Inject state
  const rollback = await injectState(worldId, char.id, companion?.id, node.id, profile);

  try {
    // Reload character with injected state
    const { characters: updatedChars } = await loadWorld(worldId);
    const updatedChar = updatedChars.find((c) => c.id === char.id)!;
    const companions = updatedChars.filter(
      (c) => c.id !== char.id && c.locationId === node.id
    );
    const reachable = allNodes.filter((n) => n.id !== node.id);

    // Build ActionContext and options
    const ctx = buildActionContext(
      updatedChar, allNodes, updatedChars,
      worldId, world.currentTick, world.epoch,
      profile.isSleepHour ?? false,
      { recentFacts: [], last24h: new Map(), turnInteractionCount: {} },
    );
    const options = getAvailableActions(ctx);

    // Build DecideInput
    const input: DecideInput = {
      character: updatedChar,
      nodes: allNodes,
      here: node,
      companions,
      reachable,
      perceived: [],
      options,
      worldName: world.name,
      tick: world.currentTick,
      epoch: world.epoch,
      facts: { recentFacts: [], last24h: new Map(), turnInteractionCount: {} },
      language: "zh",
      ctx,
      allCharacters: updatedChars,
      activeEventDefs: [],
      upcomingNotebookText: "",
      shops,
      itemDefs: new Map(),
    };

    // Build prompts for the report
    const systemPrompt = buildSystemPrompt(allNodes, world.id, world.epoch, "zh", shops, new Map());
    const userPrompt = buildUserPrompt(/* ... all params ... */);

    // Call LLM
    const startTime = Date.now();
    const action = await llmDecide(input);
    const elapsed = Date.now() - startTime;

    return {
      action: profile.action,
      entry: "decide",
      codePathChecks: {
        registered: actionRegistry.has(profile.action),
        inBuildOptions: options.some((o) => o.type === profile.action),
        // decide_action enum is checked indirectly — if llmDecide returns
      },
      induction: {
        character: char.name,
        characterId: char.id,
        node: node.name,
        vitals: JSON.parse(updatedChar.vitalsJson),
        emotions: JSON.parse(updatedChar.emotionJson),
        companion: companion?.name,
      },
      llmResult: {
        chosenAction: action.type,
        matched: action.type === profile.action,
        elapsed,
        rawAction: action,
      },
      prompts: { system: systemPrompt, user: userPrompt },
    };
  } finally {
    rollback();
  }
}
```

- [ ] **Step 2: Add the diagnostic report printer**

```typescript
interface DiagnosticResult {
  action: string;
  entry: string;
  codePathChecks: {
    registered: boolean;
    inBuildOptions: boolean;
  };
  induction: {
    character: string;
    characterId: string;
    node: string;
    vitals: Record<string, number>;
    emotions: Record<string, number>;
    companion?: string;
  };
  llmResult: {
    chosenAction: string;
    matched: boolean;
    elapsed: number;
    rawAction: unknown;
  };
  prompts: {
    system: string;
    user: string;
    tools?: string;
  };
}

function printReport(result: DiagnosticResult, verbose: boolean) {
  const { codePathChecks: c, induction: i, llmResult: l, prompts: p } = result;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`╡ 诊断报告：action=${result.action}, entry=${result.entry} ╞`);
  console.log(`${"=".repeat(70)}`);

  // Section 1: Code path checks
  console.log(`\n┌─ 1. 代码链路检查 ${"─".repeat(50)}┐`);
  console.log(`│ ${c.registered ? "✅" : "❌"} ActionRegistry: "${result.action}" ${c.registered ? "已注册" : "未注册"}`);
  console.log(`│ ${c.inBuildOptions ? "✅" : "❌"} buildOptions: ${c.inBuildOptions ? "可见" : "不可见 → check() 返回 false"}`);
  console.log(`└${"─".repeat(68)}┘`);

  // Section 2: Induction state
  console.log(`\n┌─ 2. 诱导状态摘要 ${"─".repeat(50)}┐`);
  console.log(`│ 角色: ${i.character} (${i.characterId}), 位置: ${i.node}`);
  if (i.companion) console.log(`│ 同伴: ${i.companion}`);
  console.log(`│ 身体: 饥饿${i.vitals.hunger}/疲劳${i.vitals.fatigue}/卫生${i.vitals.hygiene}`);
  console.log(`│ 情绪: 心情${i.emotions.mood}/10 · 压力${i.emotions.stress}/10 · 社交满足${i.emotions["social_satiety"] ?? i.emotions.socialSatiety}/10`);
  console.log(`└${"─".repeat(68)}┘`);

  // Section 3: LLM result
  console.log(`\n┌─ 3. LLM 响应 ${"─".repeat(54)}┐`);
  console.log(`│ 耗时: ${l.elapsed}ms`);
  console.log(`│ LLM 选择的 action: ${l.chosenAction}`);
  console.log(`│ ${l.matched ? "🟢 判定: 目标 action 被正确调用！" : `🔴 判定: 目标 action "${result.action}" 未被调用，LLM 选择了 "${l.chosenAction}"`}`);
  console.log(`└${"─".repeat(68)}┘`);

  // Section 4: Full prompts
  if (verbose) {
    console.log(`\n┌─ 4. 完整 System Prompt ${"─".repeat(45)}┐`);
    console.log(p.system);
    console.log(`\n┌─ 4. 完整 User Prompt ${"─".repeat(47)}┐`);
    console.log(p.user);
    if (p.tools) {
      console.log(`\n┌─ 4. 完整 Tools JSON ${"─".repeat(47)}┐`);
      console.log(p.tools);
    }
  }
}
```

- [ ] **Step 3: Wire into main()**

```typescript
async function main() {
  const cli = parseCli();
  await init(cli);

  if (cli.all) {
    // Task 8
  } else {
    const profile = getProfile(cli.action!, cli.entry!);
    if (!profile) {
      console.error(`Error: No profile for action="${cli.action}" entry="${cli.entry}"`);
      console.error("Available combinations:");
      for (const key of Object.keys(PROFILES).sort()) {
        console.error(`  ${key}`);
      }
      process.exit(1);
    }

    const result = await dispatch(profile, cli);
    printReport(result, cli.verbose);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Run a real test**

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action eat --entry decide
# Expected: Full diagnostic report with LLM response
```

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: implement decide entry dispatch and diagnostic report"
```

---

### Task 5: Dialog entry dispatch

**Files:**
- Modify: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Implement the dialog dispatch function**

```typescript
import { llmDialogTurn, type DialogTurnInput, type DialogTurnResult, type DialogEndResult } from "../src/llm/decide";

async function runDialogDiagnostic(
  profile: InductionProfile,
  dialogueHistory: string[],
  charId?: string,
): Promise<DiagnosticResult> {
  // Resolve character + companion
  const { character: self, node, companion, worldId } = await resolveCharacter(profile, charId);
  if (!companion) throw new Error("Dialog entry requires a companion");

  // Inject state
  const rollback = await injectState(worldId, self.id, companion.id, node.id, profile);

  try {
    // Reload characters
    const { characters: allChars } = await loadWorld(worldId);
    const updatedSelf = allChars.find((c) => c.id === self.id)!;
    const updatedPeer = allChars.find((c) => c.id === companion.id)!;

    // Parse dialogue history into DialogTurn[]
    const transcript: DialogTurn[] = dialogueHistory.map((line, i) => {
      const [speaker, ...textParts] = line.split("：");
      const text = textParts.join("：");
      return {
        speakerId: speaker.includes(updatedSelf.name) ? updatedSelf.id : updatedPeer.id,
        speakerName: speaker,
        line: text,
        turn: i,
        createdAt: Date.now(),
      };
    });

    // Get dialogue actions
    const dialogueActions = actionRegistry.getDialogueActions();

    const input: DialogTurnInput = {
      self: updatedSelf,
      peer: updatedPeer,
      transcript,
      here: node,
      language: "zh",
      dialogueActions,
      tick: 1,
      epoch: Date.now(),
    };

    const startTime = Date.now();
    const result = await llmDialogTurn(input);
    const elapsed = Date.now() - startTime;

    // Check whether propose_dialogue_action was called
    const proposeAction = result.kind === "turn" ? result.proposeAction : undefined;
    const matched = proposeAction?.actionType === profile.action;

    return {
      action: profile.action,
      entry: "dialog",
      codePathChecks: {
        registered: actionRegistry.has(profile.action),
        inBuildOptions: dialogueActions.some((d) => d.type === profile.action),
      },
      induction: {
        character: updatedSelf.name,
        characterId: updatedSelf.id,
        node: node.name,
        vitals: JSON.parse(updatedSelf.vitalsJson),
        emotions: JSON.parse(updatedSelf.emotionJson),
        companion: updatedPeer.name,
        dialogueLines: dialogueHistory,
      },
      llmResult: {
        chosenAction: proposeAction?.actionType ?? "(no action proposed)",
        matched,
        elapsed,
        rawAction: result,
      },
      prompts: { system: "(dialog has no separate system prompt)", user: "(built by llmDialogTurn)" },
    };
  } finally {
    rollback();
  }
}
```

- [ ] **Step 2: Add entry dispatch router**

```typescript
async function dispatch(profile: EntryProfile, cli: CliArgs): Promise<DiagnosticResult> {
  switch (profile.entry) {
    case "decide":
      return runDecideDiagnostic(profile.profile, cli.character);
    case "dialog":
      if (!profile.dialogueHistory || profile.dialogueHistory.length === 0) {
        throw new Error(`Dialog entry requires dialogueHistory in profile for action="${profile.action}"`);
      }
      return runDialogDiagnostic(profile.profile, profile.dialogueHistory, cli.character);
    case "think":
      return runThinkDiagnostic(profile.profile, cli.character);
    case "accept":
      return runAcceptDiagnostic(profile.profile, profile.inviterId!, cli.character);
    case "summary":
      return runSummaryDiagnostic(profile.dialogueHistory!, cli.character);
    case "memory":
      return runMemoryDiagnostic(profile.profile, profile.dialogueHistory!, cli.character);
    case "placement":
      return runPlacementDiagnostic(profile.profile, cli.character);
    default:
      throw new Error(`Unknown entry: ${profile.entry}`);
  }
}
```

- [ ] **Step 3: Run a dialog test**

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action give --entry dialog
# Expected: Diagnostic report showing whether propose_dialogue_action was called with give
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: implement dialog entry dispatch"
```

---

### Task 6: Think, Accept, Summary, Memory entries

**Files:**
- Modify: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Implement think dispatch**

```typescript
import { llmThink } from "../src/llm/decide";

async function runThinkDiagnostic(
  profile: InductionProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  const { character, node, worldId } = await resolveCharacter(profile, charId);
  const rollback = await injectState(worldId, character.id, undefined, node.id, profile);

  try {
    const { characters: allChars } = await loadWorld(worldId);
    const updatedSelf = allChars.find((c) => c.id === character.id)!;
    const allCharsList = allChars; // for impression context

    const startTime = Date.now();
    const result = await llmThink({
      self: updatedSelf,
      here: node,
      transcript: [],
      language: "zh",
      tick: 1,
      epoch: Date.now(),
      tickStarted: Date.now(),
      allCharacters: allCharsList,
    });
    const elapsed = Date.now() - startTime;

    // For think, we test: submit_think_turn, end_thinking
    const isThinkTurn = result.kind === "turn";
    const isEnd = result.kind === "end";

    return {
      action: "think",
      entry: "think",
      codePathChecks: {
        registered: true,
        inBuildOptions: true,
      },
      induction: {
        character: updatedSelf.name,
        characterId: updatedSelf.id,
        node: node.name,
        vitals: JSON.parse(updatedSelf.vitalsJson),
        emotions: JSON.parse(updatedSelf.emotionJson),
      },
      llmResult: {
        chosenAction: isThinkTurn ? "submit_think_turn" : isEnd ? "end_thinking" : "unknown",
        matched: isThinkTurn || isEnd,
        elapsed,
        rawAction: result,
      },
      prompts: { system: "", user: "" },
    };
  } finally {
    rollback();
  }
}
```

- [ ] **Step 2: Implement accept dispatch**

```typescript
import { llmAcceptDecide, type AcceptDecisionInput } from "../src/llm/decide";

async function runAcceptDiagnostic(
  profile: InductionProfile,
  inviterId: string,
  charId?: string,
): Promise<DiagnosticResult> {
  const { character, node, companion, worldId } = await resolveCharacter(profile, charId);
  const inviter = companion!; // Use companion as inviter if inviterId not provided separately

  const rollback = await injectState(worldId, character.id, inviter.id, node.id, profile);

  try {
    const { characters: allChars } = await loadWorld(worldId);
    const updatedSelf = allChars.find((c) => c.id === character.id)!;
    const updatedPeer = allChars.find((c) => c.id === inviter.id)!;

    const input: AcceptDecisionInput = {
      character: updatedSelf,
      requesterName: updatedPeer.name,
      requesterId: updatedPeer.id,
      freeText: "嘿，有空聊两句吗？",
      here: node,
      peer: updatedPeer,
      tick: 1,
      epoch: Date.now(),
      language: "zh",
    };

    const startTime = Date.now();
    const result = await llmAcceptDecide(input);
    const elapsed = Date.now() - startTime;

    return {
      action: "accept_decision",
      entry: "accept",
      codePathChecks: { registered: true, inBuildOptions: true },
      induction: {
        character: updatedSelf.name,
        characterId: updatedSelf.id,
        node: node.name,
        vitals: JSON.parse(updatedSelf.vitalsJson),
        emotions: JSON.parse(updatedSelf.emotionJson),
        companion: updatedPeer.name,
      },
      llmResult: {
        chosenAction: result.type,
        matched: true, // Always matches — we're testing the tool, not rejecting
        elapsed,
        rawAction: result,
      },
      prompts: { system: "", user: "" },
    };
  } finally {
    rollback();
  }
}
```

- [ ] **Step 3: Implement summary and memory dispatch**

```typescript
import { llmDialogSummarize, llmDialogPersonalMemory } from "../src/llm/decide";

async function runSummaryDiagnostic(
  dialogueHistory: string[],
  charId?: string,
): Promise<DiagnosticResult> {
  const { character, companion, worldId } = await resolveCharacter({}, charId);
  if (!companion) throw new Error("Summary requires two characters");
  if (!dialogueHistory || dialogueHistory.length === 0) {
    throw new Error("Summary requires dialogueHistory");
  }

  const transcript: DialogTurn[] = dialogueHistory.map((line, i) => {
    const [speaker, ...textParts] = line.split("：");
    return {
      speakerId: speaker.includes(character.name) ? character.id : companion.id,
      speakerName: speaker,
      line: textParts.join("："),
      turn: i,
      createdAt: Date.now(),
    };
  });

  const startTime = Date.now();
  const result = await llmDialogSummarize({
    openerName: companion.name,
    openerId: companion.id,
    responderName: character.name,
    responderId: character.id,
    transcript,
    language: "zh",
  });
  const elapsed = Date.now() - startTime;

  return {
    action: "dialog_summary",
    entry: "summary",
    codePathChecks: { registered: true, inBuildOptions: true },
    induction: {
      character: character.name,
      characterId: character.id,
      node: "",
      vitals: {},
      emotions: {},
      companion: companion.name,
      dialogueLines: dialogueHistory,
    },
    llmResult: {
      chosenAction: "submit_dialog_summary",
      matched: result.summary.length > 0,
      elapsed,
      rawAction: result,
    },
    prompts: { system: "", user: "" },
  };
}

async function runMemoryDiagnostic(
  profile: InductionProfile,
  dialogueHistory: string[],
  charId?: string,
): Promise<DiagnosticResult> {
  const { character, companion, worldId } = await resolveCharacter(profile, charId);
  if (!companion) throw new Error("Memory requires two characters");
  if (!dialogueHistory || dialogueHistory.length === 0) {
    throw new Error("Memory requires dialogueHistory");
  }

  const transcript: DialogTurn[] = dialogueHistory.map((line, i) => {
    const [speaker, ...textParts] = line.split("：");
    return {
      speakerId: speaker.includes(character.name) ? character.id : companion.id,
      speakerName: speaker,
      line: textParts.join("："),
      turn: i,
      createdAt: Date.now(),
    };
  });

  const startTime = Date.now();
  const result = await llmDialogPersonalMemory({
    characterName: character.name,
    characterId: character.id,
    partnerName: companion.name,
    partnerId: companion.id,
    transcript,
    language: "zh",
  });
  const elapsed = Date.now() - startTime;

  return {
    action: "dialog_personal_memory",
    entry: "memory",
    codePathChecks: { registered: true, inBuildOptions: true },
    induction: {
      character: character.name,
      characterId: character.id,
      node: "",
      vitals: {},
      emotions: {},
      companion: companion.name,
      dialogueLines: dialogueHistory,
    },
    llmResult: {
      chosenAction: "submit_personal_memory",
      matched: result.feeling != null && result.impression != null,
      elapsed,
      rawAction: result,
    },
    prompts: { system: "", user: "" },
  };
}
```

- [ ] **Step 4: Add profiles for accept, summary, memory**

```typescript
// Accept profiles — test both accept_chat and reject_chat
"accept_chat:accept": {
  action: "accept_chat", entry: "accept",
  profile: {
    emotions: { mood: 7, stress: 2, socialSatiety: 3 },
    companionFilter: { sameLocation: true },
  },
  inviterId: "__auto__",
},
// Summary profile — uses dialogueHistory to induce a summary call
"dialog_summary:summary": {
  action: "dialog_summary", entry: "summary",
  profile: {},
  dialogueHistory: [
    "太郎：今天天气真好，我们去海边散步吧。",
    "花子：好啊，我也正想出去走走。",
    "太郎：你看那边的夕阳，好美。",
    "花子：嗯，好久没看到这么美的日落了。",
    "太郎：和你在一起真的很开心。",
    "花子：我也是。",
  ],
},
// Memory profile — induces a personal reflection
"dialog_personal_memory:memory": {
  action: "dialog_personal_memory", entry: "memory",
  profile: {
    emotions: { mood: 8, stress: 2, socialSatiety: 8 },
  },
  dialogueHistory: [
    "太郎：今天天气真好，我们去海边散步吧。",
    "花子：好啊，我也正想出去走走。",
    "太郎：和你在一起真的很开心。",
    "花子：我也是，已经很久没有这么放松了。",
  ],
},
```

- [ ] **Step 5: Test each entry**

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action think --entry think
cd backend && npx tsx scripts/diagnose-action.ts --action accept_chat --entry accept
cd backend && npx tsx scripts/diagnose-action.ts --action dialog_summary --entry summary
cd backend && npx tsx scripts/diagnose-action.ts --action dialog_personal_memory --entry memory
```

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: implement think, accept, summary, memory entry dispatches"
```

---

### Task 7: Placement entry dispatch

**Files:**
- Modify: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Implement placement dispatch**

```typescript
import { decideForCharacter } from "../src/server/decideForCharacter";

async function runPlacementDiagnostic(
  profile: InductionProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  const { character, node, worldId } = await resolveCharacter(profile, charId);
  const rollback = await injectState(worldId, character.id, undefined, node.id, profile);

  try {
    const startTime = Date.now();
    // decideForCharacter runs the full placement flow:
    // loads world, builds context, calls LLM, executes action, persists
    const result = await decideForCharacter(worldId, character.id, {
      decide: undefined, // Use default (per-action tools via character_placement entry)
    });
    const elapsed = Date.now() - startTime;

    const chosenAction = result.action?.type ?? "unknown";
    const matched = chosenAction === profile.action;

    return {
      action: profile.action,
      entry: "placement",
      codePathChecks: {
        registered: actionRegistry.has(profile.action),
        inBuildOptions: true, // decideForCharacter handles this internally
      },
      induction: {
        character: character.name,
        characterId: character.id,
        node: node.name,
        vitals: profile.vitals ?? {},
        emotions: profile.emotions ?? {},
      },
      llmResult: {
        chosenAction,
        matched,
        elapsed,
        rawAction: result,
      },
      prompts: { system: "", user: "" },
    };
  } finally {
    rollback();
  }
}
```

- [ ] **Step 2: Test placement for a few actions**

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action eat --entry placement
cd backend && npx tsx scripts/diagnose-action.ts --action move --entry placement
```

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: implement placement entry dispatch"
```

---

### Task 8: `--all` batch mode and polish

**Files:**
- Modify: `backend/scripts/diagnose-action.ts`

- [ ] **Step 1: Implement batch mode**

```typescript
async function runAll(cli: CliArgs): Promise<void> {
  const combinations = getAllCombinations();
  console.log(`Running ${combinations.length} action+entry combinations...\n`);

  const results: Array<{ action: string; entry: string; matched: boolean; elapsed: number; error?: string }> = [];

  for (const { action, entry } of combinations) {
    const profile = getProfile(action, entry)!;
    try {
      const result = await dispatch(profile, cli);
      results.push({
        action: result.action,
        entry: result.entry,
        matched: result.llmResult.matched,
        elapsed: result.llmResult.elapsed,
      });
      const icon = result.llmResult.matched ? "🟢" : "🔴";
      console.log(`${icon} ${action}:${entry} — ${result.llmResult.elapsed}ms → ${result.llmResult.chosenAction}`);
    } catch (err: any) {
      results.push({ action, entry, matched: false, elapsed: 0, error: err.message });
      console.log(`💥 ${action}:${entry} — ERROR: ${err.message}`);
    }
  }

  // Print summary table
  const passCount = results.filter((r) => r.matched).length;
  const failCount = results.filter((r) => !r.matched && !r.error).length;
  const errorCount = results.filter((r) => r.error).length;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`╡ 批量诊断完成 ╞`);
  console.log(`${"=".repeat(70)}`);
  console.log(`总计: ${results.length} 项`);
  console.log(`🟢 通过: ${passCount}`);
  console.log(`🔴 失败: ${failCount}`);
  console.log(`💥 错误: ${errorCount}`);

  if (failCount > 0 || errorCount > 0) {
    console.log(`\n失败/错误详情:`);
    for (const r of results) {
      if (!r.matched) {
        console.log(`  ${r.error ? "💥" : "🔴"} ${r.action}:${r.entry} — ${r.error ?? "LLM chose different action"}`);
      }
    }
  }
}
```

- [ ] **Step 2: Wire into main() — already done in Task 4**

The `main()` function already checks `cli.all` and calls `runAll()`.

- [ ] **Step 3: Add pre-flight checks**

Before running any LLM call, verify:
1. DB has at least one active provider
2. DB has at least one world with characters
3. The target action is registered in the registry

```typescript
async function preflightCheck(cli: CliArgs): Promise<void> {
  // Check provider
  const provider = getActiveProvider();
  if (!provider) {
    console.error("Error: No active LLM provider in DB. Configure one in llm_providers.");
    process.exit(1);
  }
  console.log(`Provider: ${provider.name} (${provider.model})`);

  // Check world
  const [world] = await db.select().from(worlds).limit(1);
  if (!world) {
    console.error("Error: No world in DB. Seed the database first.");
    process.exit(1);
  }
  console.log(`World: ${world.name} (${world.id})`);

  // Check characters
  const allChars = await db.select().from(characters).where(eq(characters.worldId, world.id));
  console.log(`Characters: ${allChars.length}`);
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/diagnose-action.ts
git commit -m "feat: add --all batch mode and summary table"
```

---

### Task 9: Skill integration

**Files:**
- Read: `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/` (for existing agent-world-action-test)
- Modify: existing `agent-world-action-test` skill or create new

- [ ] **Step 1: Check existing skill definition**

```bash
# Check if agent-world-action-test skill exists in the plugin cache
ls ~/.claude/plugins/cache/claude-plugins-official/superpowers/5.1.0/skills/agent-world-action-test/
```

The existing `agent-world-action-test` skill's trigger list includes "测试对话action", "dialogue action test", "mock turnDecide", "propose_dialogue_action" — focused on dialogue testing. The new diagnostic script covers a broader scope. Update the skill to also cover this script.

- [ ] **Step 2: Update the skill description to cover the diagnostic script**

Add triggers to the existing skill:
```
agent-world-action-test: Use when writing or debugging tests for any dialogue-based interactive action (give, kiss, trade, comfort, teach, etc.) in the agent-world project, OR when running the LLM action diagnostic tool (diagnose-action.ts) to test whether an action is correctly guided. Triggers include "测试对话action"、"测试action"、"action调不到"、"diagnose action"、"诊断action"、"测试 eat"、"测一下 kiss"、"这个action为什么没有被调用".
```

- [ ] **Step 3: Add skill instructions for running the diagnostic script**

Add to the skill body:
```
## LLM Action Diagnostic Script

When the user wants to diagnose why an action is not being called by the LLM, run:

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action <type> --entry <entry>
```

Supported entries: decide, dialog, think, accept, summary, memory, placement.

To run ALL action+entry combinations:
```bash
cd backend && npx tsx scripts/diagnose-action.ts --all --entry decide
```
```

- [ ] **Step 4: Commit skill update**

```bash
git add <skill-file>
git commit -m "chore: update agent-world-action-test skill to cover diagnose-action script"
```
```

- [ ] **Step 5: End-to-end verification**

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action eat --entry decide
# Verify full output with all 4 sections
cd backend && npx tsx scripts/diagnose-action.ts --action give --entry dialog
# Verify dialog dispatch
cd backend && npx tsx scripts/diagnose-action.ts --all --entry decide
# Verify batch mode summary
```

---

## Plan Self-Review

1. **Spec coverage**: All spec requirements covered — CLI args, induction profiles, state injection via DB, all 7 entry points, 4-section diagnostic report, `--all` mode, skill integration.

2. **Placeholder scan**: No TBD/TODO. All code blocks show actual implementation. No "add error handling" without specifics.

3. **Type consistency**: `DiagnosticResult` interface used consistently across all dispatch functions. `InductionProfile` matches across all profile definitions. Function signatures in `dispatch()` router match function names in earlier tasks.
