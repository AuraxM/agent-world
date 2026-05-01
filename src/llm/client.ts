/**
 * LLM 客户端单例。配置来自 DB 中 is_active = true 的 llm_provider 行
 * （管理入口：/admin → POST /api/admin/providers）。
 *
 * 没有 active provider 时：
 *   - hasApiKey() 返回 false → decide() 走 wait fallback
 *   - getLLMClient() / getModelName() 抛错（仅在 hasApiKey() 为 true 后才会被调到）
 *
 * 30s 超时、最多重试 1 次（与 spec 一致）。
 */
import OpenAI from "openai";
import { getActiveProvider, type LLMProvider } from "./providers";

export const REQUEST_TIMEOUT_MS = 30_000;
export const REQUEST_MAX_RETRIES = 1;

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_llm__: OpenAI | undefined;
}

function safeGetActive(): LLMProvider | undefined {
  try {
    return getActiveProvider();
  } catch {
    return undefined;
  }
}

function buildClient(): OpenAI {
  const active = getActiveProvider();
  if (!active) {
    throw new Error("没有激活的 LLM provider；请在 /admin 添加并激活一个 provider");
  }
  return new OpenAI({
    apiKey: active.apiKey,
    baseURL: active.baseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: REQUEST_MAX_RETRIES,
  });
}

export function getLLMClient(): OpenAI {
  if (!globalThis.__agent_world_llm__) {
    globalThis.__agent_world_llm__ = buildClient();
  }
  return globalThis.__agent_world_llm__;
}

export function getModelName(): string {
  const active = getActiveProvider();
  if (!active) {
    throw new Error("没有激活的 LLM provider");
  }
  return active.model;
}

export function hasApiKey(): boolean {
  return !!safeGetActive()?.apiKey;
}

/** 测试用：替换全局 client（请在测试 afterEach 还原）。 */
export function __setLLMClientForTest(c: OpenAI | undefined) {
  globalThis.__agent_world_llm__ = c;
}
