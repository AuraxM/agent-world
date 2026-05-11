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

async function main() {
  const cli = parseCli();
  await init(cli);

  if (cli.all) {
    console.log("--all mode not yet implemented");
  } else {
    console.log(`Action: ${cli.action}, Entry: ${cli.entry}`);
    console.log("Diagnostic dispatch not yet implemented");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
