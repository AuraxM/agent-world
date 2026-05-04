/**
 * 角色推理耗时基准测试。
 *
 * 测量每个角色在「有对话」和「无对话」情况下单回合推理（LLM decide 调用）的耗时。
 * 对话由角色自主选择 speak 触发 —— 脚本没有办法强制触发或阻止对话，
 * 因此通过运行多个 tick 并分别统计来收集两种场景的数据。
 *
 * 用法：npx tsx scripts/benchmark-reasoning.ts [worldId] [tickCount]
 *   worldId 默认 "world-yu-no-tani"
 *   tickCount 默认 5
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { tick, type DecideFn, type DecideInput } from "@/engine/tick";
import { hasApiKey, getModelName } from "@/llm/client";
import { getActiveProvider } from "@/llm/providers";
import { createLogger } from "@/util/logger";

const benchLog = createLogger("benchmark");

interface CharacterTiming {
  characterId: string;
  characterName: string;
  decideMs: number;
  actionType: string;
}

interface TickSample {
  tick: number;
  totalMs: number;
  decidePhaseMs: number;
  dialogPhaseMs: number;
  hadDialog: boolean;
  characters: CharacterTiming[];
}

async function main() {
  if (!hasApiKey()) {
    console.error("没有激活的 LLM provider，请先在 /admin 添加并激活一个 provider");
    process.exit(1);
  }

  const worldId = process.argv[2] ?? "world-yu-no-tani";
  const tickCount = parseInt(process.argv[3] ?? "5", 10);

  const active = getActiveProvider()!;
  console.log(`Provider: ${active.name}`);
  console.log(`Model: ${getModelName(active.id)}`);
  console.log(`Ticks: ${tickCount}`);
  console.log("=" .repeat(60));

  const samples: TickSample[] = [];

  for (let i = 0; i < tickCount; i++) {
    const charTimings: CharacterTiming[] = [];

    // 包装 decide 函数以测量每个角色的 LLM 耗时
    const instrumentedDecide: DecideFn = async (input: DecideInput) => {
      const t0 = Date.now();
      const { llmDecide } = await import("@/llm/decide");
      const action = await llmDecide(input);
      const elapsed = Date.now() - t0;
      charTimings.push({
        characterId: input.character.id,
        characterName: input.character.name,
        decideMs: elapsed,
        actionType: action.type,
      });
      return action;
    };

    const tickT0 = Date.now();
    const r = await tick(worldId, { decide: instrumentedDecide });
    const totalMs = Date.now() - tickT0;

    // r.decisions 在对话阶段后被改写为 wait proxy，所以用原始 charTimings 判断
    const hadDialog = charTimings.some((t) => t.actionType === "speak");
    const dialogChars = charTimings.filter((t) => t.actionType === "speak").map((t) => t.characterId);

    // 估算各阶段耗时（非精确，但足以分层）
    const decidePhaseMs = charTimings.reduce((sum, t) => sum + t.decideMs, 0);
    // 对话阶段耗时 = 总耗时 - 所有并行 decide 中的最大值（近似）
    const maxDecideMs = charTimings.length > 0
      ? Math.max(...charTimings.map((t) => t.decideMs))
      : 0;
    const dialogPhaseMs = Math.max(0, totalMs - maxDecideMs - 200); // 200ms 留给其他阶段

    samples.push({
      tick: r.fromTick,
      totalMs,
      decidePhaseMs,
      dialogPhaseMs,
      hadDialog,
      characters: charTimings,
    });

    const icon = hadDialog ? "💬" : "🔇";
    const avgDecide = charTimings.length > 0
      ? (charTimings.reduce((s, t) => s + t.decideMs, 0) / charTimings.length).toFixed(0)
      : "0";
    console.log(
      `${icon} tick #${r.fromTick}  total=${totalMs}ms  avgDecide=${avgDecide}ms  maxDecide=${maxDecideMs}ms  dialog~=${dialogPhaseMs}ms  chars=${charTimings.length}`,
    );

    if (hadDialog) {
      const speakers = r.decisions
        .filter((d) => d.action.type === "say")
        .map((d) => {
          const ct = charTimings.find((t) => t.characterId === d.characterId);
          return `${d.characterId}(${ct?.decideMs ?? "?"}ms)`;
        });
      console.log(`  对话角色: ${speakers.join(", ")}`);
    }

    // 每个角色细节
    for (const ct of charTimings) {
      const marker = dialogChars.includes(ct.characterId) ? " [对话]" : "";
      console.log(`    ${ct.characterName}: decide=${ct.decideMs}ms  action=${ct.actionType}${marker}`);
    }
    console.log();
  }

  // ── 汇总 ──
  const withDialog = samples.filter((s) => s.hadDialog);
  const withoutDialog = samples.filter((s) => !s.hadDialog);

  console.log("=" .repeat(60));
  console.log("汇总统计");
  console.log("=" .repeat(60));

  function stats(arr: number[]) {
    if (arr.length === 0) return { n: 0, mean: 0, min: 0, max: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      n: arr.length,
      mean: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
    };
  }

  const allDecideTimes = samples.flatMap((s) => s.characters.map((c) => c.decideMs));
  const withDialogDecideTimes = withDialog.flatMap((s) => s.characters.map((c) => c.decideMs));
  const withoutDialogDecideTimes = withoutDialog.flatMap((s) => s.characters.map((c) => c.decideMs));

  console.log("\n单角色 LLM decide 耗时 (ms):");

  function printStats(label: string, s: ReturnType<typeof stats>) {
    if (s.n === 0) { console.log(`  ${label}: (无数据)`); return; }
    console.log(`  ${label}: n=${s.n}  mean=${s.mean}  min=${s.min}  max=${s.max}  p50=${s.p50}  p95=${s.p95}`);
  }

  printStats("全部      ", stats(allDecideTimes));
  printStats("有对话 tick", stats(withDialogDecideTimes));
  printStats("无对话 tick", stats(withoutDialogDecideTimes));

  console.log("\nTick 总耗时 (ms):");
  const allTotalTimes = samples.map((s) => s.totalMs);
  printStats("全部 tick  ", stats(allTotalTimes));
  if (withDialog.length > 0) printStats("有对话 tick ", stats(withDialog.map((s) => s.totalMs)));
  if (withoutDialog.length > 0) printStats("无对话 tick ", stats(withoutDialog.map((s) => s.totalMs)));

  if (withDialog.length > 0) {
    console.log("\n对话阶段额外耗时 (ms):");
    printStats("对话阶段   ", stats(withDialog.map((s) => s.dialogPhaseMs)));
  }

  console.log("\n样本分布:", `有对话=${withDialog.length}`, `无对话=${withoutDialog.length}`);
}

main().catch((e) => {
  console.error("benchmark failed:", e);
  process.exit(1);
});
