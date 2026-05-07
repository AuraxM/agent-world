/**
 * LLM 客户端（按 provider 缓存）。
 * 不同 LLM 入口可以路由到不同的 provider。
 *
 * 没有 provider 时：
 *   - hasApiKey() 返回 false → decide() 走 wait fallback
 *   - getLLMClient() / getModelName() 抛错（仅在 hasApiKey() 为 true 后才会被调到）
 *
 * 30s 超时、最多重试 1 次。
 */
import OpenAI from "openai";
import { getProvider, getDefaultProviderId, getEntryConfig } from "./providers";

export const REQUEST_TIMEOUT_MS = 30_000;
export const REQUEST_MAX_RETRIES = 1;

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_llm_clients__: Map<string, OpenAI> | undefined;
}

function getClientCache(): Map<string, OpenAI> {
  if (!globalThis.__agent_world_llm_clients__) {
    globalThis.__agent_world_llm_clients__ = new Map();
  }
  return globalThis.__agent_world_llm_clients__;
}

function buildClient(providerId: string): OpenAI {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`LLM provider not found: ${providerId}`);
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: REQUEST_MAX_RETRIES,
  });
}

export function resolveProviderId(entryName: string): string {
  const config = getEntryConfig(entryName);
  return config.providerId ?? getDefaultProviderId();
}

export function getLLMClient(providerId: string): OpenAI {
  const cache = getClientCache();
  let client = cache.get(providerId);
  if (!client) {
    client = buildClient(providerId);
    cache.set(providerId, client);
  }
  return client;
}

export function getLLMClientForEntry(entryName: string): OpenAI {
  return getLLMClient(resolveProviderId(entryName));
}

export function getModelName(providerId: string): string {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`LLM provider not found: ${providerId}`);
  return provider.model;
}

export function getModelNameForEntry(entryName: string): string {
  return getModelName(resolveProviderId(entryName));
}

export function hasApiKey(): boolean {
  try {
    const providerId = getDefaultProviderId();
    const provider = getProvider(providerId);
    return !!provider?.apiKey;
  } catch {
    return false;
  }
}

/** Test-only: replace client in cache. */
export function __setLLMClientForTest(providerId: string, c: OpenAI | undefined) {
  const cache = getClientCache();
  if (c) {
    cache.set(providerId, c);
  } else {
    cache.delete(providerId);
  }
}
