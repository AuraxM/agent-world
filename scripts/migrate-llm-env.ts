/**
 * 一次性迁移：把 .env.local 中的 DEEPSEEK_* 写入 DB 的 llm_providers 表并设为 active。
 *
 * 用法：`npx tsx scripts/migrate-llm-env.ts`
 *
 * 重复运行安全：已有任意 provider 时直接 skip。
 * 迁移完成后可删除 .env.local / .env.example 中的 DEEPSEEK_* 变量。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createProvider, listProviders, setActiveProvider } from "@/llm/providers";

function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash";

  if (!apiKey) {
    console.error("缺 DEEPSEEK_API_KEY，请确认 .env.local 中存在该变量");
    process.exit(1);
  }

  const existing = listProviders();
  if (existing.length > 0) {
    console.log(`已存在 ${existing.length} 个 provider，跳过迁移：`);
    for (const p of existing) {
      console.log(`  - ${p.id} ${p.name} (${p.model}) active=${p.isActive}`);
    }
    return;
  }

  const p = createProvider({ name: "DeepSeek", baseUrl, apiKey, model });
  setActiveProvider(p.id);
  console.log(`✓ 已迁移 provider ${p.id} (${p.name}, model=${p.model}) 并设为 active`);
}

try {
  main();
} catch (err) {
  console.error("migrate-llm-env failed:", err);
  process.exit(1);
}
