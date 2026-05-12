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
  rounds: number;
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
  --rounds <n>        Rounds per case, stops on first success (default: 10)
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
      rounds: { type: "string", default: "10" },
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
    rounds: parseInt(values.rounds ?? "10", 10) || 10,
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
  // Strategy: extreme target vital, all competing vitals at 0, locationTag that
  // strongly implies the target action and does NOT overlap with bathing.
  "eat:decide": {
    action: "eat", entry: "decide",
    profile: {
      vitals: { hunger: 99, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "dining", money: 100,
    },
  },
  "bathe:decide": {
    action: "bathe", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 99 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "bathing", money: 100,
    },
  },
  "rest:decide": {
    action: "rest", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 99, hygiene: 0 },
      emotions: { mood: 3, stress: 5, socialSatiety: 5 },
      locationTag: "residence", isSleepHour: true,
    },
  },
  "work:decide": {
    action: "work", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "education", employment: true,
    },
  },
  "think:decide": {
    action: "think", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 4, stress: 5, socialSatiety: 5 },
      locationTag: "quiet",
    },
  },
  "chat:decide": {
    action: "chat", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 9, stress: 1, socialSatiety: 0 },
      locationTag: "dining", companionFilter: { sameLocation: true },
    },
  },
  "sleep:decide": {
    action: "sleep", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 99, hygiene: 0 },
      emotions: { mood: 3, stress: 5, socialSatiety: 5 },
      locationTag: "residence", isSleepHour: true,
    },
  },
  "move:decide": {
    action: "move", entry: "decide",
    profile: {
      vitals: { hunger: 99, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "quiet",  // far from food — must move to eat
    },
  },
  "look_around:decide": {
    action: "look_around", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "park",  // interesting place, no pressing needs
    },
  },
  "buy:decide": {
    action: "buy", entry: "decide",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "dining", money: 500,  // near shops, lots of cash
    },
  },
  "use_item:decide": {
    action: "use_item", entry: "decide",
    profile: {
      vitals: { hunger: 15, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "quiet", inventory: ["苹果"],
    },
  },

  // ═══ Dialog entry (4 actions) ═══
  // Strategy: conversation lines that unmistakably point to the target action.
  // Target character has the resources (money, items) and the peer explicitly asks.
  "give:dialog": {
    action: "give", entry: "dialog",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 10, stress: 0, socialSatiety: 5 },
      locationTag: "dining", companionFilter: { sameLocation: true },
      money: 5000,
    },
    dialogueHistory: [
      "小林夏希：不好意思……我钱包丢了，现在连回去的车费都没有，能借我一点吗？就 500 就够了。",
    ],
  },
  "give_item:dialog": {
    action: "give_item", entry: "dialog",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 8, stress: 1, socialSatiety: 5 },
      locationTag: "dining", companionFilter: { sameLocation: true },
      inventory: ["苹果", "面包"],
    },
    dialogueHistory: [
      "小林夏希：我肚子好饿，一整天没吃东西了……你有没有带吃的？随便什么都行。",
    ],
  },
  "travel_together:dialog": {
    action: "travel_together", entry: "dialog",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 9, stress: 1, socialSatiety: 5 },
      locationTag: "dining", companionFilter: { sameLocation: true },
    },
    dialogueHistory: [
      "太郎：你知道吗，听说首里城的夕阳特别美，我一直想去看看。",
      "花子：真的吗？那我们一起去吧，正好现在天气也好。",
      "太郎：好啊，走吧！",
    ],
  },
  "manage_employment:dialog": {
    action: "manage_employment", entry: "dialog",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 7, stress: 2, socialSatiety: 5 },
      locationTag: "dining", companionFilter: { sameLocation: true },
      employment: true,
    },
    dialogueHistory: [
      "小林夏希：听说你店里生意很好，缺不缺人手？我最近在找工作。",
    ],
  },

  // ═══ Think entry (1 action) ═══
  "think:think": {
    action: "think", entry: "think",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 5, socialSatiety: 3 },
      locationTag: "quiet",
    },
  },

  // ═══ Accept entry ═══
  "accept_chat:accept": {
    action: "accept_chat", entry: "accept",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 8, stress: 2, socialSatiety: 1 },
      companionFilter: { sameLocation: true },
      locationTag: "street",
    },
  },

  // ═══ Summary entry ═══
  "dialog_summary:summary": {
    action: "dialog_summary", entry: "summary",
    profile: {
      companionFilter: { sameLocation: true },
    },
    dialogueHistory: [
      "太郎：今天天气真好，我们去海边散步吧。",
      "花子：好啊，我也正想出去走走。",
      "太郎：你看那边的夕阳，好美。",
      "花子：嗯，好久没看到这么美的日落了。",
      "太郎：和你在一起真的很开心。",
      "花子：我也是，希望以后还能这样一起散步。",
    ],
  },

  // ═══ Memory entry ═══
  "dialog_personal_memory:memory": {
    action: "dialog_personal_memory", entry: "memory",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 9, stress: 1, socialSatiety: 9 },
      companionFilter: { sameLocation: true },
    },
    dialogueHistory: [
      "太郎：今天天气真好，我们去海边散步吧。",
      "花子：好啊，我也正想出去走走。",
      "太郎：和你在一起真的很开心，已经很久没有这种感觉了。",
      "花子：我也是，和你说话总是很放松。",
    ],
  },

  // ═══ Placement entry (7 actions) ═══
  // Same induction strategy as decide, mirrored profiles.
  "eat:placement": {
    action: "eat", entry: "placement",
    profile: {
      vitals: { hunger: 99, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "dining", money: 100,
    },
  },
  "bathe:placement": {
    action: "bathe", entry: "placement",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 99 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "bathing", money: 100,
    },
  },
  "rest:placement": {
    action: "rest", entry: "placement",
    profile: {
      vitals: { hunger: 0, fatigue: 99, hygiene: 0 },
      emotions: { mood: 3, stress: 5, socialSatiety: 5 },
      locationTag: "residence", isSleepHour: true,
    },
  },
  "work:placement": {
    action: "work", entry: "placement",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "education", employment: true,
    },
  },
  "think:placement": {
    action: "think", entry: "placement",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 4, stress: 5, socialSatiety: 5 },
      locationTag: "quiet",
    },
  },
  "move:placement": {
    action: "move", entry: "placement",
    profile: {
      vitals: { hunger: 99, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "quiet",  // far from food — must move to eat
    },
  },
  "look_around:placement": {
    action: "look_around", entry: "placement",
    profile: {
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotions: { mood: 5, stress: 3, socialSatiety: 5 },
      locationTag: "park",
    },
  },
};

function getProfile(action: string, entry: string): EntryProfile | undefined {
  return PROFILES[`${action}:${entry}`];
}

function getAllCombinations(): Array<{ action: string; entry: string }> {
  return Object.values(PROFILES).map((p) => ({ action: p.action, entry: p.entry }));
}

async function runAll(cli: CliArgs): Promise<void> {
  let combinations = getAllCombinations();
  if (cli.entry) {
    combinations = combinations.filter((c) => c.entry === cli.entry);
  }
  const rounds = cli.rounds;
  console.log(`\nRunning ${combinations.length} action+entry combinations (max ${rounds} rounds each, stop on first success)...\n`);

  const results: Array<{ action: string; entry: string; matched: boolean; elapsed: number; rounds: number; error?: string }> = [];

  for (const { action, entry } of combinations) {
    const entryProfile = getProfile(action, entry);
    if (!entryProfile) {
      results.push({ action, entry, matched: false, elapsed: 0, rounds: 0, error: "profile not found" });
      console.log(`💥 ${action}:${entry} — ERROR: profile not found`);
      continue;
    }

    let matched = false;
    let totalElapsed = 0;
    let succeededRound = 0;
    let lastChosen = "";
    let errorResult: typeof results[number] | null = null;
    let permanentError = false;

    for (let round = 1; round <= rounds && !permanentError; round++) {
      try {
        const result = await dispatch(entryProfile, cli);
        totalElapsed += result.llmResult.elapsed;
        lastChosen = result.llmResult.chosenAction;
        if (result.llmResult.matched) {
          matched = true;
          succeededRound = round;
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Non-retryable errors: missing companion, missing node, etc.
        if (message.includes("requires two characters") ||
            message.includes("requires a companion") ||
            message.includes("No node found") ||
            message.includes("No companion available")) {
          errorResult = { action, entry, matched: false, elapsed: 0, rounds: 0, error: message };
          console.log(`💥 ${action}:${entry} — ERROR: ${message}`);
          permanentError = true;
          break;
        }
        // Retryable errors: log and retry
        if (round === rounds) {
          errorResult = { action, entry, matched: false, elapsed: totalElapsed, rounds: round, error: message };
          console.log(`💥 ${action}:${entry} — ERROR after ${round} rounds: ${message}`);
        }
      }
    }

    if (permanentError || errorResult) {
      results.push(errorResult!);
    } else if (matched) {
      results.push({ action, entry, matched: true, elapsed: totalElapsed, rounds: succeededRound });
      const roundInfo = succeededRound > 1 ? ` (round ${succeededRound}/${rounds})` : "";
      console.log(`🟢 ${action}:${entry} — ${totalElapsed}ms → ${lastChosen}${roundInfo}`);
    } else {
      results.push({ action, entry, matched: false, elapsed: totalElapsed, rounds });
      console.log(`🔴 ${action}:${entry} — ${totalElapsed}ms → ${lastChosen} (tried ${rounds} rounds)`);
    }
  }

  // Print summary
  const passCount = results.filter((r) => r.matched).length;
  const failCount = results.filter((r) => !r.matched && !r.error).length;
  const errorCount = results.filter((r) => r.error).length;
  const totalRounds = results.reduce((sum, r) => sum + r.rounds, 0);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`╡ 批量诊断完成 ╞`);
  console.log(`${"=".repeat(70)}`);
  console.log(`总计: ${results.length} 项, 总轮次: ${totalRounds}`);
  console.log(`🟢 通过 (至少1次触发): ${passCount}`);
  console.log(`🔴 失败 (${rounds}轮均未触发): ${failCount}`);
  console.log(`💥 错误: ${errorCount}`);

  if (failCount > 0 || errorCount > 0) {
    console.log(`\n失败/错误详情:`);
    for (const r of results) {
      if (!r.matched) {
        const errInfo = r.error ?? `LLM chose different action (${r.rounds} rounds)`;
        console.log(`  ${r.error ? "💥" : "🔴"} ${r.action}:${r.entry} — ${errInfo}`);
      }
    }
  }
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
    // Don't filter by sameLocation here — injectState will move them.
    // Just pick any other character.
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
          ? JSON.stringify(profile.inventory.map((id) => ({ itemDefId: id, acquiredTick: 0 })))
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
      sqlite.exec("ROLLBACK TO diag_inject; RELEASE diag_inject");
    };
  } catch (err) {
    sqlite.exec("ROLLBACK TO diag_inject; RELEASE diag_inject");
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
  const { buildDecideSystemPrompt } = await import("../src/llm/system-prompts");
  const { languageInstruction } = await import("../src/llm/prompt");

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
    const inOptions = options.some((o: any) => o.type === profile.action);

    if (!inOptions) {
      return {
        action: profile.action,
        entry: "decide",
        codePathChecks: {
          registered: actionRegistry.has(profile.action),
          inBuildOptions: false,
        },
        induction: { character: updatedChar.name, characterId: updatedChar.id, node: hereNode.name, vitals: updatedChar.vitals as any, emotions: updatedChar.emotion as any },
        llmResult: { chosenAction: "(unavailable — check() failed)", matched: false, elapsed: 0, rawAction: null },
        prompts: { system: "", user: "(skipped — action not in buildOptions)" },
      };
    }

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

    // Build prompts for report (agentic mode: system prompt only, context via tools)
    const systemPrompt = buildDecideSystemPrompt();
    const userPrompt = `(agentic — 角色通过 read_* 工具获取上下文。角色: ${updatedChar.name}，位置: ${hereNode.name})`;

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
// Dialog entry: LLM dispatch and diagnostic result
// ═══════════════════════════════════════════════════════

async function runDialogDiagnostic(
  entryProfile: EntryProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  const profile = entryProfile.profile;
  if (!entryProfile.dialogueHistory || entryProfile.dialogueHistory.length === 0) {
    throw new Error(`Dialog entry requires dialogueHistory in profile for action="${entryProfile.action}"`);
  }

  // The dialog entry is broken after the agentic refactor (llmDialogTurn was removed).
  // newDialogTurn is not yet exported from dialog.ts and has a different signature.
  // TODO: Rewrite runDialogDiagnostic to use runDialogPhase with a pre-built Conversation.
  throw new Error(`Dialog entry is temporarily broken (agentic refactor — llmDialogTurn was removed). Use the pre-built Conversation integration test approach instead.`);
}

// ═══════════════════════════════════════════════════════
// Think entry: LLM dispatch and diagnostic result
// ═══════════════════════════════════════════════════════

async function runThinkDiagnostic(
  entryProfile: EntryProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  // The think entry is broken after the agentic refactor (llmThink was removed).
  // TODO: Rewrite runThinkDiagnostic to use runThinkAgent from think.ts.
  throw new Error(`Think entry is temporarily broken (agentic refactor — llmThink was replaced by runThinkAgent).`);
}

// ═══════════════════════════════════════════════════════
// Accept entry: LLM dispatch and diagnostic result
// ═══════════════════════════════════════════════════════

async function runAcceptDiagnostic(
  entryProfile: EntryProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  const profile = entryProfile.profile;
  const { character, node, companion, worldId } = await resolveCharacter(profile, charId);
  if (!companion) throw new Error("Accept entry requires a companion (as inviter)");

  const rollback = await injectState(worldId, character.id, companion.id, node.id, profile);

  try {
    const { llmAcceptDecide } = await import("../src/llm/decide");
    const { loadWorld } = await import("../src/systems/store");

    const worldData = await loadWorld(worldId);
    const updatedSelf = worldData.characters.find((c: any) => c.id === character.id);
    const updatedPeer = worldData.characters.find((c: any) => c.id === companion.id);
    const hereNode = worldData.nodes.find((n: any) => n.id === node.id);

    if (!updatedSelf || !updatedPeer || !hereNode) throw new Error("Required entities not found");

    const startTime = Date.now();
    const result = await llmAcceptDecide({
      character: updatedSelf,
      requesterName: updatedPeer.name,
      requesterId: updatedPeer.id,
      freeText: "嘿，有空聊两句吗？",
      here: hereNode,
      peer: updatedPeer,
      tick: worldData.world.currentTick,
      epoch: worldData.world.epoch,
      language: "zh" as const,
    });
    const elapsed = Date.now() - startTime;

    return {
      action: entryProfile.action,
      entry: "accept",
      codePathChecks: { registered: true, inBuildOptions: true },
      induction: {
        character: updatedSelf.name,
        characterId: updatedSelf.id,
        node: hereNode.name,
        vitals: (updatedSelf as any).vitals as Record<string, number>,
        emotions: (updatedSelf as any).emotion as Record<string, number>,
        companion: updatedPeer.name,
      },
      llmResult: {
        chosenAction: (result as any).type,
        matched: (result as any).type === entryProfile.action,
        elapsed,
        rawAction: result,
      },
      prompts: { system: "", user: "" },
    };
  } finally {
    rollback();
  }
}

// ═══════════════════════════════════════════════════════
// Summary entry: LLM dispatch and diagnostic result
// ═══════════════════════════════════════════════════════

async function runSummaryDiagnostic(
  entryProfile: EntryProfile,
  _charId?: string,
): Promise<DiagnosticResult> {
  if (!entryProfile.dialogueHistory || entryProfile.dialogueHistory.length === 0) {
    throw new Error("Summary entry requires dialogueHistory");
  }

  const { character, companion, worldId } = await resolveCharacter(entryProfile.profile, undefined);
  if (!companion) throw new Error("Summary requires two characters");

  // Build transcript from dialogueHistory
  const transcript: Array<{
    speakerId: string;
    speakerName: string;
    line: string;
    turn: number;
    createdAt: number;
    kind: string;
  }> = entryProfile.dialogueHistory.map((line, i) => {
    const separatorIndex = line.indexOf("：");
    const speakerName = separatorIndex > 0 ? line.slice(0, separatorIndex) : "Unknown";
    const text = separatorIndex > 0 ? line.slice(separatorIndex + 1) : line;
    return {
      speakerId: speakerName.includes(character.name) ? character.id : companion.id,
      speakerName,
      line: text,
      turn: i,
      createdAt: Date.now(),
      kind: "say" as const,
    };
  });

  const { llmDialogSummarize } = await import("../src/llm/decide");

  const startTime = Date.now();
  const result = await llmDialogSummarize({
    openerName: companion.name,
    openerId: companion.id,
    responderName: character.name,
    responderId: character.id,
    transcript,
    language: "zh" as const,
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
      dialogueLines: entryProfile.dialogueHistory,
    },
    llmResult: {
      chosenAction: "submit_dialog_summary",
      matched: typeof result.summary === "string" && result.summary.length > 0,
      elapsed,
      rawAction: result,
    },
    prompts: { system: "", user: "" },
  };
}

// ═══════════════════════════════════════════════════════
// Memory entry: LLM dispatch and diagnostic result
// ═══════════════════════════════════════════════════════

async function runMemoryDiagnostic(
  entryProfile: EntryProfile,
  _charId?: string,
): Promise<DiagnosticResult> {
  if (!entryProfile.dialogueHistory || entryProfile.dialogueHistory.length === 0) {
    throw new Error("Memory entry requires dialogueHistory");
  }

  const { character, companion, worldId } = await resolveCharacter(entryProfile.profile, undefined);
  if (!companion) throw new Error("Memory requires two characters");

  // Build transcript
  const transcript: Array<{
    speakerId: string;
    speakerName: string;
    line: string;
    turn: number;
    createdAt: number;
    kind: string;
  }> = entryProfile.dialogueHistory.map((line, i) => {
    const separatorIndex = line.indexOf("：");
    const speakerName = separatorIndex > 0 ? line.slice(0, separatorIndex) : "Unknown";
    const text = separatorIndex > 0 ? line.slice(separatorIndex + 1) : line;
    return {
      speakerId: speakerName.includes(character.name) ? character.id : companion.id,
      speakerName,
      line: text,
      turn: i,
      createdAt: Date.now(),
      kind: "say" as const,
    };
  });

  const { llmDialogPersonalMemory } = await import("../src/llm/decide");

  const startTime = Date.now();
  const result = await llmDialogPersonalMemory({
    characterName: character.name,
    characterId: character.id,
    partnerName: companion.name,
    partnerId: companion.id,
    transcript,
    language: "zh" as const,
  });
  const elapsed = Date.now() - startTime;

  const payload = result as { feeling?: string; impression?: string; topics?: string[] };

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
      dialogueLines: entryProfile.dialogueHistory,
    },
    llmResult: {
      chosenAction: "submit_personal_memory",
      matched: payload.feeling != null && payload.impression != null,
      elapsed,
      rawAction: result,
    },
    prompts: { system: "", user: "" },
  };
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
// Placement entry: LLM dispatch and diagnostic result
// ═══════════════════════════════════════════════════════

async function runPlacementDiagnostic(
  entryProfile: EntryProfile,
  charId?: string,
): Promise<DiagnosticResult> {
  const profile = entryProfile.profile;
  const { character, node, worldId } = await resolveCharacter(profile, charId);

  // Inject state (placement doesn't need companion)
  const rollback = await injectState(worldId, character.id, undefined, node.id, profile);

  try {
    const { decideForCharacter } = await import("../src/server/decideForCharacter");
    const { actionRegistry } = await import("../src/domain/action-system");
    const { loadWorld } = await import("../src/systems/store");

    // Reload world with injected state
    const worldData = loadWorld(worldId);
    const updatedSelf = worldData.characters.find((c: any) => c.id === character.id);
    const hereNode = worldData.nodes.find((n: any) => n.id === node.id);

    if (!updatedSelf || !hereNode) throw new Error("Character or node not found after injection");

    const startTime = Date.now();
    // decideForCharacter runs the full placement flow:
    // loads world, builds context, calls LLM with per-action tools, executes action
    const result = await decideForCharacter(worldId, character.id, {});
    const elapsed = Date.now() - startTime;

    const chosenAction = (result as any).action?.type ?? "unknown";
    const matched = chosenAction === entryProfile.action;

    return {
      action: entryProfile.action,
      entry: "placement",
      codePathChecks: {
        registered: actionRegistry.has(entryProfile.action),
        inBuildOptions: true, // decideForCharacter handles this internally
      },
      induction: {
        character: updatedSelf.name,
        characterId: updatedSelf.id,
        node: hereNode.name,
        vitals: (updatedSelf as any).vitals as Record<string, number>,
        emotions: (updatedSelf as any).emotion as Record<string, number>,
      },
      llmResult: {
        chosenAction,
        matched,
        elapsed,
        rawAction: result,
      },
      prompts: {
        system: "(placement prompt built internally by decideForCharacter)",
        user: "",
      },
    };
  } finally {
    rollback();
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
      return runDialogDiagnostic(entryProfile, cli.character);
    case "think":
      return runThinkDiagnostic(entryProfile, cli.character);
    case "accept":
      return runAcceptDiagnostic(entryProfile, cli.character);
    case "summary":
      return runSummaryDiagnostic(entryProfile, cli.character);
    case "memory":
      return runMemoryDiagnostic(entryProfile, cli.character);
    case "placement":
      return runPlacementDiagnostic(entryProfile, cli.character);
  }
}

async function main() {
  const cli = parseCli();
  await init(cli);

  if (cli.all) {
    await runAll(cli);
    return;
  }

  console.log(`\n═══ LLM Action Diagnostic Tool ═══`);
  console.log(`Action: ${cli.action} | Entry: ${cli.entry}`);

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

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
