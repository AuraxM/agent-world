import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * 五张表：worlds / nodes / characters / events_log / snapshots。
 * 复杂结构（personality / statuses / shortMemory / relations …）一律以 JSON
 * 文本列存储；Stage 1 不做关系展开查询，所有领域操作都在内存中完成。
 */

export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mapId: text("map_id").notNull().default(""),
  currentTick: integer("current_tick").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const nodes = sqliteTable(
  "nodes",
  {
    id: text("id").notNull(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    tagsJson: text("tags_json").notNull().default("[]"),
    capacity: integer("capacity"),
    privacy: text("privacy").notNull().default("public"),
    visibleFromParent: integer("visible_from_parent", { mode: "boolean" })
      .notNull()
      .default(true),
    shortcutsJson: text("shortcuts_json").notNull().default("[]"),
    isEntry: integer("is_entry", { mode: "boolean" })
      .notNull()
      .default(false),
    travelCost: integer("travel_cost"),
    x: integer("x"),
    y: integer("y"),
    w: integer("w"),
    h: integer("h"),
    spriteKey: text("sprite_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.id] }),
    index("nodes_world_idx").on(t.worldId),
  ],
);

export const characters = sqliteTable(
  "characters",
  {
    id: text("id").notNull(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    avatar: text("avatar"),
    age: integer("age").notNull().default(30),
    gender: text("gender").notNull().default("male"),
    profession: text("profession").notNull().default("farmer"),
    money: integer("money").notNull().default(0),
    incomeLevel: integer("income_level").notNull().default(0),
    expenseExempt: integer("expense_exempt", { mode: "boolean" }).notNull().default(false),
    incomeMultiplier: real("income_multiplier").notNull().default(1.0),
    biography: text("biography").notNull().default(""),
    origin: text("origin").notNull().default("local"),
    locationId: text("location_id").notNull(),
    personalityJson: text("personality_json").notNull(),
    vitalsJson: text("vitals_json")
      .notNull()
      .default('{"hunger":0,"fatigue":0,"hygiene":0}'),
    emotionJson: text("emotion_json")
      .notNull()
      .default('{"mood":0,"stress":0,"social_satiety":0}'),
    abilitiesJson: text("abilities_json").notNull().default("[]"),
    shortMemoryJson: text("short_memory_json").notNull().default("[]"),
    dailyMemoryJson: text("daily_memory_json").notNull().default("[]"),
    longMemoryJson: text("long_memory_json").notNull().default("[]"),
    relationsJson: text("relations_json").notNull().default("{}"),
    currentActionJson: text("current_action_json"),
    lastSleepTick: integer("last_sleep_tick").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.id] }),
    index("characters_world_idx").on(t.worldId),
  ],
);

export const eventsLog = sqliteTable(
  "events_log",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("events_world_tick_idx").on(t.worldId, t.tick),
  ],
);

export const agentThoughts = sqliteTable(
  "agent_thoughts",
  {
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    characterId: text("character_id").notNull(),
    tick: integer("tick").notNull(),
    actionJson: text("action_json").notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.characterId, t.tick] }),
    index("thoughts_actor_tick_idx").on(t.worldId, t.characterId, t.tick),
  ],
);

export const llmProviders = sqliteTable(
  "llm_providers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    apiKey: text("api_key").notNull(),
    model: text("model").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
);

export const llmEntryConfigs = sqliteTable(
  "llm_entry_configs",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").references(() => llmProviders.id, { onDelete: "set null" }),
    thinkingEnabled: integer("thinking_enabled", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("snapshots_world_tick_idx").on(t.worldId, t.tick)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    characterId: text("character_id").notNull(),
    amount: integer("amount").notNull(),
    category: text("category", { enum: ["expense", "income", "transfer_in", "transfer_out"] })
      .notNull(),
    description: text("description").notNull().default(""),
    counterpartyId: text("counterparty_id"),
  },
  (t) => [
    index("transactions_world_char_tick_idx").on(t.worldId, t.characterId, t.tick),
  ],
);
