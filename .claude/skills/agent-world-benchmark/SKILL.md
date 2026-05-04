---
name: agent-world-benchmark
description: Use when the user wants to benchmark, measure, or test LLM reasoning time for agent-world character turns. Triggers include "测试一下推理时间"、"benchmark"、"测一下耗时"、"推理需要多久"、"一个角色一回合"、"reasoning time"、"LLM latency"、"对话阶段耗时"、"性能测试"。Use this skill before running any timing or performance measurement on the agent-world simulation.
---

# Agent-world reasoning benchmark

Measure per-character LLM reasoning time and total tick time, with breakdowns for the decide phase and dialog phase. The benchmark script runs real LLM calls against the active provider — it uses real API credits.

## Quick run

```bash
npx tsx .claude/skills/agent-world-benchmark/scripts/benchmark-reasoning.ts [worldId] [tickCount]
```

- `worldId` defaults to `world-yu-no-tani`
- `tickCount` defaults to `5`

## What it measures

| Metric | Definition |
|--------|-----------|
| Per-character decide time | Wall-clock time for a single `llmDecide` call (one LLM API round-trip) |
| Decision phase total | `max(decide times)` — all characters run in parallel via `Promise.all` |
| Dialog phase time | Time spent in accept_decision + dialog_turn + dialog_summarize LLM calls |
| Tick total | End-to-end wall-clock time for one `tick()` call |

The script wraps the decide function with timing instrumentation, runs N ticks, and separates samples by whether dialogue occurred (any character chose `speak`).

## How to read the output

Each tick prints:
```
🔇/💬 tick #N  total=Xms  avgDecide=Yms  maxDecide=Zms  dialog~=Wms  chars=C
  角色名: decide=Xms  action=type [对话]
```

The summary at the end shows aggregate statistics (mean, min, max, p50, p95) for:
- Per-character decide times (all / with-dialogue ticks / without-dialogue ticks)
- Total tick times
- Dialog phase overhead

## Key interpretations

- **Without dialogue**: Total tick time ≈ `max(decide)` ≈ slowest single character's decide call. All decide calls run concurrently.
- **With dialogue**: Total tick time ≈ `max(decide)` + dialog phase. The dialog phase can be 5-10x the decision phase because dialog turns run per-pair sequentially and each turn is a separate LLM call.
- Per-character decide time is the **same** whether or not dialog happens — the dialog phase is additive after all decisions are made.

## Prerequisites

- An active LLM provider configured in the `/admin` UI (or seeded via DB)
- The world must exist and have characters (run `seed` if needed)
- `npx tsx` available (comes with the project's devDependencies)
