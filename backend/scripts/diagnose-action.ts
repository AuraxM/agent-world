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
  timeout: number;
  all: boolean;
  verbose: boolean;
}

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
  npx tsx scripts/diagnose-action.ts --all --entry decide`;

function validateTimeout(raw: string | undefined): number {
  const timeoutRaw = parseInt(raw ?? "60000", 10);
  if (isNaN(timeoutRaw) || timeoutRaw <= 0) {
    console.error(`Error: --timeout must be a positive number, got "${raw}"`);
    process.exit(1);
  }
  return timeoutRaw;
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
    timeout: validateTimeout(values.timeout),
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
    companion = allChars.find((c) => c.id !== char.id);
    if (!companion) throw new Error("No companion available (need at least 2 characters)");
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
  const dbModule = await import("../src/db/index");
  const drizzleDb = dbModule.db;
  return (drizzleDb as unknown as { $client: { run: (sql: string) => void; exec: (sql: string) => void } }).$client;
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
}

async function main() {
  const cli = parseCli();
  await init(cli);

  if (cli.all) {
    console.log(`Running ${getAllCombinations().length} action+entry combinations...`);
    console.log("--all mode not yet implemented");
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

    const resolved = await resolveCharacter(profile.profile, cli.character);
    console.log(`Character: ${resolved.character.name} (${resolved.character.id})`);
    console.log(`Node: ${resolved.node.name} (${resolved.node.id})`);
    if (resolved.companion) {
      console.log(`Companion: ${resolved.companion.name} (${resolved.companion.id})`);
    }

    const rollback = await injectState(
      resolved.worldId,
      resolved.character.id,
      resolved.companion?.id,
      resolved.node.id,
      profile.profile,
    );

    try {
      const { db } = await import("../src/db/index");
      const { characters } = await import("../src/db/schema");
      const { eq, and } = await import("drizzle-orm");
      const updated = await db
        .select({
          vitalsJson: characters.vitalsJson,
          emotionJson: characters.emotionJson,
          locationId: characters.locationId,
        })
        .from(characters)
        .where(and(eq(characters.worldId, resolved.worldId), eq(characters.id, resolved.character.id)))
        .then((r) => r[0]);

      console.log(`Injected vitals: ${updated?.vitalsJson}`);
      console.log(`Injected emotions: ${updated?.emotionJson}`);
      console.log(`Injected location: ${updated?.locationId}`);
      console.log("State injection verified -- rollback will restore original state.");
      console.log("Diagnostic dispatch not yet implemented");
    } finally {
      rollback();
      console.log("State rolled back.");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
