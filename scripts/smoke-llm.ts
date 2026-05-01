/**
 * 真实 LLM 冒烟测试。
 * 用法：npx tsx scripts/smoke-llm.ts
 *
 * 配置来源于 DB 中 is_active = true 的 llm_provider。
 * 加载 .env.local 仅为读取 DATABASE_URL（如自定义路径）。
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { tick } from "@/engine/tick";
import { hasApiKey, getModelName } from "@/llm/client";
import { getActiveProvider } from "@/llm/providers";

async function main() {
  if (!hasApiKey()) {
    console.error("没有激活的 LLM provider，请先在 /admin 添加并激活一个 provider");
    process.exit(1);
  }
  const active = getActiveProvider()!;
  console.log(`Provider: ${active.name}`);
  console.log(`Model: ${getModelName()}`);
  console.log(`Base URL: ${active.baseUrl}`);
  console.log("---");

  const worldId = process.argv[2] ?? "world-morning-town";
  const t0 = Date.now();
  const r = await tick(worldId);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`tick ${r.fromTick} → ${r.toTick}  (${elapsed}s)`);
  console.log(`events: ${r.events.length}, decisions: ${r.decisions.length}\n`);

  for (const d of r.decisions) {
    const a = d.action;
    const target = a.targetId ?? a.targetNodeId ?? "-";
    const free = a.freeText ? `  free: "${a.freeText.slice(0, 60)}"` : "";
    const reasoning = a.reasoning.length > 100
      ? a.reasoning.slice(0, 100) + "…"
      : a.reasoning;
    console.log(
      `[${d.characterId}] ok=${d.success} type=${a.type} target=${target}${free}\n  reasoning: ${reasoning}\n`,
    );
  }
}

main().catch((e) => {
  console.error("smoke-llm failed:", e);
  process.exit(1);
});
