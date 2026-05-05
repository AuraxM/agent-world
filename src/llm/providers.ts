import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";


export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  createdAt: number;
}

export function maskApiKey(key: string): string {
  if (key.length < 12) return "***";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

export interface CreateProviderInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface UpdateProviderInput {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

function rowToProvider(row: typeof schema.llmProviders.$inferSelect): LLMProvider {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: row.model,
    isActive: row.isActive,
    createdAt: row.createdAt.getTime(),
  };
}

export function listProviders(): LLMProvider[] {
  return db.select().from(schema.llmProviders).all().map(rowToProvider);
}

export function getProvider(id: string): LLMProvider | undefined {
  const row = db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.id, id))
    .get();
  return row ? rowToProvider(row) : undefined;
}

export function getActiveProvider(): LLMProvider | undefined {
  const row = db
    .select()
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isActive, true))
    .get();
  return row ? rowToProvider(row) : undefined;
}

export function createProvider(input: CreateProviderInput): LLMProvider {
  const id = `provider-${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  db.insert(schema.llmProviders)
    .values({
      id,
      name: input.name,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      isActive: false,
      createdAt: new Date(now),
    })
    .run();
  return getProvider(id)!;
}

export function updateProvider(id: string, input: UpdateProviderInput): LLMProvider {
  const existing = getProvider(id);
  if (!existing) throw new Error(`provider not found: ${id}`);

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.baseUrl !== undefined) updates.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) updates.apiKey = input.apiKey;
  if (input.model !== undefined) updates.model = input.model;

  if (Object.keys(updates).length > 0) {
    db.update(schema.llmProviders)
      .set(updates)
      .where(eq(schema.llmProviders.id, id))
      .run();
  }
  return getProvider(id)!;
}

export function deleteProvider(id: string): void {
  const existing = getProvider(id);
  if (!existing) throw new Error(`provider not found: ${id}`);
  db.delete(schema.llmProviders)
    .where(eq(schema.llmProviders.id, id))
    .run();
}

/** 设置活跃 provider，取消其他。切换后清除 LLM client 缓存。 */
export function setActiveProvider(id: string): LLMProvider {
  const existing = getProvider(id);
  if (!existing) throw new Error(`provider not found: ${id}`);

  db.update(schema.llmProviders)
    .set({ isActive: false })
    .where(eq(schema.llmProviders.isActive, true))
    .run();

  db.update(schema.llmProviders)
    .set({ isActive: true })
    .where(eq(schema.llmProviders.id, id))
    .run();

  globalThis.__agent_world_llm_clients__ = undefined;

  return getProvider(id)!;
}

export interface EntryConfig {
  entryName: string;
  providerId: string | null;
  thinkingEnabled: boolean;
}

/** Returns the active provider's ID, or throws if none set. */
export function getDefaultProviderId(): string {
  const row = db
    .select({ id: schema.llmProviders.id })
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isActive, true))
    .get();
  if (!row) throw new Error("没有激活的 LLM provider");
  return row.id;
}

/** Get a single entry config. Returns defaults (null provider, thinking off) if no row. */
export function getEntryConfig(entryName: string): EntryConfig {
  const row = db
    .select()
    .from(schema.llmEntryConfigs)
    .where(eq(schema.llmEntryConfigs.id, entryName))
    .get();
  if (!row) return { entryName, providerId: null, thinkingEnabled: false };
  return {
    entryName: row.id,
    providerId: row.providerId,
    thinkingEnabled: row.thinkingEnabled,
  };
}

/** List all entry configs. Missing entries are returned with defaults. */
export function listEntryConfigs(allEntryNames: string[]): EntryConfig[] {
  const rows = db.select().from(schema.llmEntryConfigs).all();
  const map = new Map(rows.map((r) => [r.id, { entryName: r.id, providerId: r.providerId, thinkingEnabled: r.thinkingEnabled }]));
  return allEntryNames.map((name) => map.get(name) ?? { entryName: name, providerId: null, thinkingEnabled: false });
}

/** Batch upsert entry configs. */
export function batchUpsertEntryConfigs(configs: { entryName: string; providerId: string | null; thinkingEnabled: boolean }[]): void {
  const now = new Date();
  db.transaction((tx) => {
    for (const c of configs) {
      const existing = tx
        .select({ id: schema.llmEntryConfigs.id })
        .from(schema.llmEntryConfigs)
        .where(eq(schema.llmEntryConfigs.id, c.entryName))
        .get();
      if (existing) {
        tx.update(schema.llmEntryConfigs)
          .set({ providerId: c.providerId, thinkingEnabled: c.thinkingEnabled, updatedAt: now })
          .where(eq(schema.llmEntryConfigs.id, c.entryName))
          .run();
      } else {
        tx.insert(schema.llmEntryConfigs)
          .values({ id: c.entryName, providerId: c.providerId, thinkingEnabled: c.thinkingEnabled, createdAt: now, updatedAt: now })
          .run();
      }
    }
  });
  // Bust all cached LLM clients since provider assignment may have changed
  globalThis.__agent_world_llm_clients__ = undefined;
}
