#!/usr/bin/env tsx
/**
 * LLM Action Diagnostic Tool
 *
 * Usage:
 *   cd backend && npx tsx scripts/diagnose-action.ts --action eat --entry decide
 *   cd backend && npx tsx scripts/diagnose-action.ts --all --entry decide
 */

import { parseArgs } from "node:util";

const VALID_ENTRIES = ["decide", "dialog", "think", "accept", "summary", "memory", "placement"] as const;
type Entry = typeof VALID_ENTRIES[number];

interface CliArgs {
  action?: string;
  entry?: Entry;
  character?: string;
  scene?: string;
  provider?: string;
  all: boolean;
  verbose: boolean;
}

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
    dialogueLines?: string[];
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

const USAGE = `Usage: npx tsx scripts/diagnose-action.ts --action <type> --entry <entry>

Options:
  --action <type>     Target action type (required, unless --all)
  --entry <entry>     Entry point: decide | dialog | think | accept | summary | memory | placement
  --character <id>    Character ID (default: auto-select first matching)
  --scene <dir>       Scene directory (default: AGENT_WORLD_SCENES_DIR)
  --provider <name>   Provider name (default: from DB config)
  --all               Run all action+entry combinations
  --verbose           Always on by default

Examples:
  npx tsx scripts/diagnose-action.ts --action eat --entry decide
  npx tsx scripts/diagnose-action.ts --action kiss --entry dialog
  npx tsx scripts/diagnose-action.ts --all --entry decide`;

function parseCli(): CliArgs {
  const { values } = parseArgs({
    options: {
      action: { type: "string" },
      entry: { type: "string" },
      character: { type: "string" },
      scene: { type: "string" },
      provider: { type: "string" },
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

  if (values.entry && !VALID_ENTRIES.includes(values.entry as Entry)) {
    console.error(`Error: --entry must be one of: ${VALID_ENTRIES.join(", ")}`);
    process.exit(1);
  }

  return {
    action: values.action,
    entry: values.entry as Entry | undefined,
    character: values.character,
    scene: values.scene,
    provider: values.provider,
    all: values.all,
    verbose: values.verbose,
  };
}

async function init(cli: CliArgs) {
  // 0. Load .env before any backend imports
  const { config } = await import("dotenv");
  config({ path: new URL("../.env", import.meta.url).pathname });

  // Dynamic imports — after .env is loaded so DATABASE_URL is available
  const { db } = await import("../src/db/index");
  const { actionRegistry } = await import("../src/domain/action-system");
  const { BUILTIN_ACTIONS } = await import("../src/systems/actions-builtin");
  const { getActiveProvider, getEntryConfig } = await import("../src/llm/providers");
  const { worlds, characters } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  // 1. Register built-in actions
  actionRegistry.registerAll(BUILTIN_ACTIONS);

  // 2. Check LLM provider
  const provider = getActiveProvider();
  if (!provider) {
    console.error("Error: No active LLM provider found in DB. Configure one in llm_providers table.");
    process.exit(1);
  }
  console.log(`Provider: ${provider.name} (${provider.model})`);

  // 3. Verify a world exists
  const [world] = await db.select().from(worlds).limit(1);
  if (!world) {
    console.error("Error: No world found in DB. Seed the database first.");
    process.exit(1);
  }
  console.log(`World: ${world.name} (${world.id})`);

  // 4. Check entry config
  if (cli.entry) {
    const entryConfig = getEntryConfig(cli.entry);
    if (!entryConfig.providerId) {
      console.warn(`Warning: No explicit LLM entry config for "${cli.entry}". Will use active provider.`);
    }
  }

  // 5. Count characters
  const allChars = await db.select().from(characters).where(eq(characters.worldId, world.id));
  console.log(`Characters: ${allChars.length}`);

  // 6. Load scene if provided
  if (cli.scene) {
    process.env.AGENT_WORLD_SCENES_DIR = cli.scene;
  }
}

// ═══════════════════════════════════════════════════════
// Induction Profiles
// ═══════════════════════════════════════════════════════

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
  dialogueHistory?: string[];
  inviterId?: string;
}

const PROFILES: Record<string, EntryProfile> = {
  // ═══ Decide entry (11 actions) ═══
  "eat:decide": {
    action: "eat", entry: "decide",
    profile: {
      vitals: { hunger: 90, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "dining", money: 100,
    },
  },
  "bathe:decide": {
    action: "bathe", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 95 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "bathing", money: 100,
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
      locationPrivacy: "private", isSleepHour: true,
    },
  },
  "move:decide": {
    action: "move", entry: "decide",
    profile: {
      vitals: { hunger: 85, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
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
    },
  },
  "use_item:decide": {
    action: "use_item", entry: "decide",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 5 },
      inventory: ["apple"],
    },
  },

  // ═══ Dialog entry (4 actions) ═══
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

  // ═══ Think entry (1 action) ═══
  "think:think": {
    action: "think", entry: "think",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 5, socialSatiety: 3 },
    },
  },

  // ═══ Placement entry (7 actions — those that appear in decide but also work in placement) ═══
  "eat:placement": {
    action: "eat", entry: "placement",
    profile: {
      vitals: { hunger: 90, fatigue: 10, hygiene: 50 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "dining", money: 100,
    },
  },
  "bathe:placement": {
    action: "bathe", entry: "placement",
    profile: {
      vitals: { hunger: 10, fatigue: 10, hygiene: 95 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "bathing", money: 100,
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

function getAllCombinations(): Array<{ action: string; entry: string }> {
  return Object.values(PROFILES).map((p) => ({ action: p.action, entry: p.entry }));
}

// ═══════════════════════════════════════════════════════
// State injection engine
// ═══════════════════════════════════════════════════════

async function resolveCharacter(
  profile: InductionProfile,
  preferredCharId?: string,
): Promise<{
  character: { id: string; name: string; locationId: string; vitalsJson: string; emotionJson: string; money: number; inventoryJson: string };
  node: { id: string; name: string; tagsJson: string; privacy: string };
  companion?: { id: string; name: string };
  worldId: string;
}> {
  const { db } = await import("../src/db/index");
  const { worlds, characters, nodes } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  const [world] = await db.select().from(worlds).limit(1);
  if (!world) throw new Error("No world in DB");

  const allChars = await db.select().from(characters).where(eq(characters.worldId, world.id));
  const allNodes = await db.select().from(nodes).where(eq(nodes.worldId, world.id));

  let char: typeof allChars[number];
  if (preferredCharId) {
    const found = allChars.find((c) => c.id === preferredCharId);
    if (!found) throw new Error(`Character ${preferredCharId} not found`);
    char = found;
  } else {
    char = allChars[0];
  }

  let node: typeof allNodes[number] | undefined;
  if (profile.locationTag) {
    node = allNodes.find((n) => {
      const tags: string[] = JSON.parse(n.tagsJson);
      return tags.includes(profile.locationTag!);
    });
    if (!node) throw new Error(`No node found with tag "${profile.locationTag}"`);
  } else if (profile.locationPrivacy) {
    node = allNodes.find((n) => n.privacy === profile.locationPrivacy);
    if (!node) throw new Error(`No node found with privacy "${profile.locationPrivacy}"`);
  } else {
    node = allNodes.find((n) => n.id === char.locationId) ?? allNodes[0];
  }

  let companion: typeof allChars[number] | undefined;
  if (profile.companionFilter) {
    let candidates = allChars.filter((c) => c.id !== char.id);
    if (profile.companionFilter.sameLocation) {
      candidates = candidates.filter((c) => c.locationId === node.id);
    }
    companion = candidates[0];
    if (!companion) throw new Error("No companion available matching filter criteria");
  }

  return {
    character: {
      id: char.id,
      name: char.name,
      locationId: char.locationId,
      vitalsJson: char.vitalsJson,
      emotionJson: char.emotionJson,
      money: char.money,
      inventoryJson: char.inventoryJson,
    },
    node: {
      id: node.id,
      name: node.name,
      tagsJson: node.tagsJson,
      privacy: node.privacy,
    },
    companion: companion ? { id: companion.id, name: companion.name } : undefined,
    worldId: world.id,
  };
}

async function getRawSqlite() {
  const { db } = await import("../src/db/index");
  return db.$client; // Already typed as better-sqlite3 Database by drizzle-orm
}

async function injectState(
  worldId: string,
  charId: string,
  companionId: string | undefined,
  nodeId: string,
  profile: InductionProfile,
): Promise<() => void> {
  const { db } = await import("../src/db/index");
  const { characters } = await import("../src/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const sqlite = await getRawSqlite();
  sqlite.exec("SAVEPOINT diag_inject");

  try {
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

    const vitals = {
      hunger: 0,
      fatigue: 0,
      hygiene: 0,
      ...(profile.vitals ?? {}),
    };
    const rawEmotions = profile.emotions ?? {};
    const emotions = {
      mood: rawEmotions.mood ?? 0,
      stress: rawEmotions.stress ?? 0,
      social_satiety: rawEmotions.socialSatiety ?? 0,
    };

    await db
      .update(characters)
      .set({
        vitalsJson: JSON.stringify(vitals),
        emotionJson: JSON.stringify(emotions),
        locationId: nodeId,
        money: profile.money ?? orig?.money ?? 100,
        inventoryJson: profile.inventory
          ? JSON.stringify(profile.inventory)
          : orig?.inventoryJson ?? "[]",
      })
      .where(and(eq(characters.worldId, worldId), eq(characters.id, charId)));

    if (companionId) {
      await db
        .update(characters)
        .set({ locationId: nodeId })
        .where(and(eq(characters.worldId, worldId), eq(characters.id, companionId)));
    }

    return () => {
      sqlite.exec("ROLLBACK TO diag_inject");
    };
  } catch (err) {
    sqlite.exec("ROLLBACK TO diag_inject");
    throw err;
  }
}

// ═══════════════════════════════════════════════════════
// Decide entry: LLM dispatch and diagnostic result
// ═══════════════════════════════════════════════════════

async function runDecideDiagnostic(
  profile: EntryProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  // Dynamic imports
  const { actionRegistry } = await import("../src/domain/action-system");
  const { loadWorld } = await import("../src/systems/store");
  const { llmDecide } = await import("../src/llm/decide");
  const { buildActionContext, getAvailableActions } = await import("../src/systems/actions");
  const { buildSystemPrompt, buildUserPrompt } = await import("../src/llm/prompt");

  // Resolve character + node
  const { character, node, companion, worldId } = await resolveCharacter(profile.profile, charId);

  // Inject state
  const rollback = await injectState(worldId, character.id, companion?.id, node.id, profile.profile);

  try {
    // Re-load world with injected state
    const worldData = loadWorld(worldId);

    // Find the updated character
    const updatedChar = worldData.characters.find((c: any) => c.id === character.id);
    if (!updatedChar) throw new Error(`Character ${character.id} not found after injection`);

    // Find the here node
    const hereNode = worldData.nodes.find((n: any) => n.id === node.id);
    if (!hereNode) throw new Error(`Node ${node.id} not found`);

    // Find companions at same location
    const companions = worldData.characters.filter(
      (c: any) => c.id !== character.id && c.locationId === node.id,
    );


	    // Build a complete (but empty) AggregatedFacts stub.
	    const emptyFacts = {
	      activityNodeId: null as string | null,
	      activityNodeName: null as string | null,
	      restNodeId: null as string | null,
	      restNodeName: null as string | null,
	      hoursAtCurrentLocation: 0,
	      todayActionCounts: {} as Partial<Record<string, number>>,
	      todayChatTargets: {} as Record<string, number>,
	    };

    // Build action context
    const ctx = buildActionContext(
      updatedChar,
      worldData.nodes,
      worldData.characters,
      worldId,
      worldData.world.currentTick,
      worldData.world.epoch,
      profile.profile.isSleepHour ?? false,
      emptyFacts as any,
      undefined, // locationOverrides
      worldData.shops || [],
      new Map(), // itemDefs
    );

    const options = getAvailableActions(ctx);

    // Build DecideInput
    const input = {
      character: updatedChar,
      nodes: worldData.nodes,
      here: hereNode,
      companions,
      reachable: worldData.nodes.filter((n: any) => n.id !== node.id),
      perceived: [],
      options,
      worldName: worldData.world.name,
      tick: worldData.world.currentTick,
      epoch: worldData.world.epoch,
      facts: emptyFacts as any,
      language: "zh" as const,
      ctx,
      allCharacters: worldData.characters,
      activeEventDefs: [],
      upcomingNotebookText: "",
      shops: worldData.shops || [],
      itemDefs: new Map(),
    };

    // Build prompts for report
    const systemPrompt = buildSystemPrompt({
      worldName: worldData.world.name,
      nodes: worldData.nodes,
      language: "zh" as const,
      shops: worldData.shops || [],
    });
    const userPrompt = buildUserPrompt({
      character: updatedChar,
      here: hereNode,
      companions,
      perceived: [],
      options,
      tick: worldData.world.currentTick,
      epoch: worldData.world.epoch,
      facts: emptyFacts as any,
      language: "zh" as const,
      allCharacters: worldData.characters,
      nodes: worldData.nodes,
      activeEventDefs: [],
      upcomingNotebookText: "",
      shops: worldData.shops || [],
      itemDefs: new Map(),
    });

    // Call LLM
    const startTime = Date.now();
    const action = await llmDecide(input as any);
    const elapsed = Date.now() - startTime;

    const vitalsParsed: Record<string, number> = updatedChar.vitals as unknown as Record<string, number>;
    const emotionsParsed: Record<string, number> = updatedChar.emotion as unknown as Record<string, number>;

    return {
      action: profile.action,
      entry: "decide",
      codePathChecks: {
        registered: actionRegistry.has(profile.action),
        inBuildOptions: options.some((o: any) => o.type === profile.action),
      },
      induction: {
        character: updatedChar.name,
        characterId: updatedChar.id,
        node: hereNode.name,
        vitals: vitalsParsed,
        emotions: emotionsParsed,
        companion: companion?.name,
      },
      llmResult: {
        chosenAction: (action as any).type,
        matched: (action as any).type === profile.action,
        elapsed,
        rawAction: action,
      },
      prompts: { system: systemPrompt, user: userPrompt },
    };
  } finally {
    rollback();
  }
}

// ═══════════════════════════════════════════════════════
// Report printer
// ═══════════════════════════════════════════════════════

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
  console.log(`│ 身体: 饥饿${i.vitals.hunger ?? "?"}/疲劳${i.vitals.fatigue ?? "?"}/卫生${i.vitals.hygiene ?? "?"}`);
  console.log(`│ 情绪: 心情${i.emotions.mood ?? "?"}/10 · 压力${i.emotions.stress ?? "?"}/10 · 社交满足${i.emotions.social_satiety ?? "?"}/10`);
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

// ═══════════════════════════════════════════════════════
// Dispatch router
// ═══════════════════════════════════════════════════════

async function dispatch(entryProfile: EntryProfile, cli: CliArgs): Promise<DiagnosticResult> {
  switch (entryProfile.entry) {
    case "decide":
      return runDecideDiagnostic(entryProfile, cli.character);
    case "dialog":
      throw new Error("Dialog entry not yet implemented");
    case "think":
      throw new Error("Think entry not yet implemented");
    case "accept":
      throw new Error("Accept entry not yet implemented");
    case "summary":
      throw new Error("Summary entry not yet implemented");
    case "memory":
      throw new Error("Memory entry not yet implemented");
    case "placement":
      throw new Error("Placement entry not yet implemented");
  }
}

async function main() {
  const cli = parseCli();
  await init(cli);

  if (cli.all) {
    console.log(`Running ${getAllCombinations().length} action+entry combinations...`);
    console.log("--all mode not yet implemented");
  } else {
    const entryProfile = getProfile(cli.action!, cli.entry!);
    if (!entryProfile) {
      console.error(`Error: No profile for action="${cli.action}" entry="${cli.entry}"`);
      console.error("Available combinations:");
      for (const key of Object.keys(PROFILES).sort()) {
        console.error(`  ${key}`);
      }
      process.exit(1);
    }

    console.log(`Testing: ${cli.action} @ ${cli.entry}`);
    const result = await dispatch(entryProfile, cli);
    printReport(result, cli.verbose);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
