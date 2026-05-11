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
    console.log(`Action: ${cli.action}, Entry: ${cli.entry}`);
    console.log(`Profile found: ${JSON.stringify(profile.profile, null, 2)}`);
    if (profile.dialogueHistory) {
      console.log(`Dialogue history: ${profile.dialogueHistory.length} lines`);
    }
    console.log("Diagnostic dispatch not yet implemented");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
