import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type OpenAI from "openai";
import { db, schema } from "@/db/client";

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_llm__: OpenAI | undefined;
  // eslint-disable-next-line no-var
  var __agent_world_llm_clients__: Record<string, OpenAI> | undefined;
}

export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  createdAt: number;
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
