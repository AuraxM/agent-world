/**
 * 睡觉时触发的记忆压缩：短→日（LLM 摘要），每 7 日→周（LLM 摘要）。
 * 在 tick.ts 的 dialog 阶段之后、execute 阶段之前调用。
 */
import { randomUUID } from "node:crypto";
import type { Tick, Character, Memory, Language } from "../domain/index";
import { llmMemoryCompress as _llmMemoryCompress } from "./decide";
import {
  buildMemoryCompressionPrompt,
  buildWeeklyCompressionPrompt,
} from "./prompt";

// ── Test override ──

let __test_memoryCompress: ((args: { prompt: string; language: Language }) => Promise<string>) | null = null;

/** Test-only: override the LLM memory compress function. */
export function __setTestMemoryCompress(fn: ((args: { prompt: string; language: Language }) => Promise<string>) | null): void {
  __test_memoryCompress = fn;
}

function llmMemoryCompress(args: { prompt: string; language: Language }): Promise<string> {
  const fn = __test_memoryCompress ?? _llmMemoryCompress;
  return fn(args);
}

/**
 * 对一名角色执行睡觉时的记忆压缩。
 * 1. 收集上次睡觉至今的 shortMemory
 * 2. LLM 摘要 → push 到 dailyMemory
 * 3. dailyMemory 满 7 条 → LLM 摘要 → push 到 longMemory（周记忆），删除被压缩的 7 条日记忆
 * 4. 清空 shortMemory
 * 5. 更新 lastSleepTick
 *
 * LLM 调用失败时跳过压缩，shortMemory 原样保留。
 */
export async function compressSleepMemories(
  character: Character,
  currentTick: Tick,
  epoch: number,
  language: Language,
): Promise<void> {
  const sinceTick = character.lastSleepTick ?? 0;

  // 收集清醒期记忆（排除包含 [heuristic] 的引擎伪记忆）
  const wakeMemories = character.shortMemory.filter(
    (m) => m.tick >= sinceTick && !m.content.includes("[heuristic]"),
  );

  if (wakeMemories.length === 0) {
    // 没有值得压缩的记忆：仍然清空 shortMemory 并更新 lastSleepTick
    character.shortMemory = [];
    character.lastSleepTick = currentTick;
    return;
  }

  // 日压缩
  let dailySummary: string;
  try {
    const prompt = buildMemoryCompressionPrompt({
      characterName: character.name,
      memories: wakeMemories,
      language,
    });
    dailySummary = await llmMemoryCompress({ prompt, language });
  } catch {
    // LLM 失败：跳过本次压缩，shortMemory 不清空
    return;
  }

  const dailyMemory: Memory = {
    id: `dmem-${randomUUID().slice(0, 8)}`,
    tick: currentTick,
    importance: 3,
    content: dailySummary,
  };
  character.dailyMemory.push(dailyMemory);

  // 周压缩：dailyMemory 满 7 条
  if (character.dailyMemory.length >= 7) {
    const batch = character.dailyMemory.slice(-7);
    let weeklySummary: string;
    try {
      const prompt = buildWeeklyCompressionPrompt({
        characterName: character.name,
        dailySummaries: batch.map((m) => m.content),
        language,
      });
      weeklySummary = await llmMemoryCompress({ prompt, language });
      const weeklyMemory: Memory = {
        id: `wmem-${randomUUID().slice(0, 8)}`,
        tick: currentTick,
        importance: 4,
        content: weeklySummary,
      };
      character.longMemory.push(weeklyMemory);

      // 删除已被压缩的 7 条日记忆
      character.dailyMemory.splice(character.dailyMemory.length - 7, 7);
    } catch {
      // 周压缩失败：保留 7 条日记忆，下次睡觉时重试
    }
  }

  // 清空短期记忆
  character.shortMemory = [];
  character.lastSleepTick = currentTick;
}
