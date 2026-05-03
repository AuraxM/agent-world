/**
 * 单角色决策入口（用于"投放角色"等不推进 tick 的场景）。
 *
 * 流程：
 *   1. loadWorld → 找到目标角色
 *   2. 收集 currentTick 的所有事件（含外部预先写好的 arrival 事件）
 *   3. dispatchPerception 仅取该角色的可感知列表
 *   4. 构造 ActionContext + 决策上下文
 *   5. 调用 decideFn（强制 arrivalIntro=true）
 *   6. executeActions 仅对该角色 → 拿到 events / resolved action
 *   7. 追加 events_log + thought
 *
 * 不动 currentTick；其他角色不参与决策（他们看到 arrival 事件要等下一次 tick）。
 */
import { and, eq } from "drizzle-orm";
import { buildActionContext, getAvailableActions } from "./actions";
import { executeActions } from "./execute";
import { deriveAggregatedFacts } from "./facts";
import { dispatchPerception } from "./perception";
import {
  appendEventsLog,
  appendThoughts,
  loadRecentThoughts,
  loadWorld,
  saveWorld,
} from "./store";
import { getThinkingEnabled } from "./settings";
import { db, schema } from "@/db/client";
import { loadAllCharacters, loadManifest } from "@/config/loader";
import {
  buildSystemPrompt,
  buildUserPrompt,
  DEFAULT_SLEEP_WINDOW,
  inSleepWindow,
  timeOfDay,
} from "@/llm/prompt";
import { actionRegistry } from "@/domain/action-system";
import type { Action, Character, WorldEvent } from "@/domain/types";
import type { DecideInput } from "./tick";

const FACTS_LOOKBACK_TICKS = 48;

export interface DecideForCharacterResult {
  action: Action;
  success: boolean;
  events: WorldEvent[];
}

function fallbackWait(c: Character, reason: string): Action {
  return {
    type: "wait",
    actorId: c.id,
    reasoning: `LLM 调用失败：${reason}`,
    selfImportance: 1,
  };
}

function buildActivityNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.activityNodeId) m.set(tpl.id, tpl.activityNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}

function buildRestNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.restNodeId) m.set(tpl.id, tpl.restNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}

function getSleepWindow(characterId: string) {
  try {
    const tpl = loadAllCharacters().find((t) => t.id === characterId);
    return tpl?.sleepWindow ?? DEFAULT_SLEEP_WINDOW;
  } catch {
    return DEFAULT_SLEEP_WINDOW;
  }
}

/**
 * 加载某 worldId 在 tick=currentTick 的所有事件（用于刚被 addCharacterToWorld
 * 写入的 arrival 事件参与感知）。
 *
 * 注：events_log 表把整个 WorldEvent 序列化进 payload_json 列；这里直接解出。
 */
function loadEventsAtTick(worldId: string, tick: number): WorldEvent[] {
  // 单 tick 过滤，事件之间无内在顺序，故省略 orderBy；perception 不依赖排序。
  const rows = db
    .select()
    .from(schema.eventsLog)
    .where(
      and(
        eq(schema.eventsLog.worldId, worldId),
        eq(schema.eventsLog.tick, tick),
      ),
    )
    .all();
  return rows.map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}

export interface DecideForCharacterOptions {
  /** 测试 / 内部 stub 用；缺省走 llmDecide。 */
  decide?: (input: DecideInput) => Promise<Action>;
}

export async function decideForCharacter(
  worldId: string,
  characterId: string,
  options: DecideForCharacterOptions = {},
): Promise<DecideForCharacterResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters } = loaded;
  const c = characters.find((x) => x.id === characterId);
  if (!c) throw new Error(`character not in world: ${characterId}`);

  const fromTick = world.currentTick;
  const activityMap = buildActivityNodeMap();
  const restMap = buildRestNodeMap();
  const activityNodeId = activityMap.get(c.id) ?? null;
  const restNodeId = restMap.get(c.id) ?? null;
  c.activityNodeId = activityNodeId;
  c.restNodeId = restNodeId;
  const sleepWindow = getSleepWindow(c.id);
  c.sleepWindow = sleepWindow;

  // 1. perception：当 tick 已写的事件
  const tickEvents = loadEventsAtTick(worldId, fromTick);
  const perceptions = dispatchPerception(nodes, characters, tickEvents);
  const perceived = perceptions.get(c.id) ?? [];

  // 2. facts + options
  const sinceTick = Math.max(0, fromTick - FACTS_LOOKBACK_TICKS);
  const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
  const facts = deriveAggregatedFacts({
    character: c,
    nodes,
    currentTick: fromTick,
    recentThoughts,
    activityNodeId,
    restNodeId,
  });
  const baseTime = timeOfDay(fromTick);
  const isSleepHour = inSleepWindow(baseTime.hour, sleepWindow);
  const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, isSleepHour, facts);
  const opts = getAvailableActions(ctx);

  // 3. 决策（强制 arrivalIntro）
  const language = loadManifest(world.mapId).language;
  let action: Action;
  try {
    // 注意：当前 llmDecide 内部自己 build prompt，不接受 arrivalIntro。
    // 本场景需要 arrivalIntro，因此**绕开 llmDecide**：复制其骨架但传 arrivalIntro=true。
    // 测试时通过 options.decide 注入 stub，跳过真实 LLM。
    if (!options.decide) {
      const { hasApiKey, getLLMClient, getModelName } = await import(
        "@/llm/client"
      );
      if (!hasApiKey()) {
        action = fallbackWait(c, "没有激活的 LLM provider");
      } else {
        const {
          buildPerActionSchema,
          buildActionTools,
          actionTypeFromToolName,
        } = await import("@/domain/schemas");
        const OpenAI = (await import("openai")).default;
        const PerActionSchema = buildPerActionSchema();
        const tools = buildActionTools(ctx);

        const system = buildSystemPrompt({
          character: c,
          worldName: world.name,
          nodes,
          language,
        });
        const user = buildUserPrompt({
          character: c,
          here: ctx.here,
          companions: ctx.companions,
          perceived,
          options: opts,
          tick: fromTick,
          facts,
          language,
          arrivalIntro: true,
        });

        try {
          const client = getLLMClient();
          const extra: Record<string, unknown> = {};
          if (getThinkingEnabled()) extra.thinking = { type: "enabled" };
          const model = getModelName();

          const messages: Array<Record<string, unknown>> = [
            { role: "system", content: system },
            { role: "user", content: user },
          ];

          let actionType: string | null = null;
          let p: Record<string, any> | null = null;

          const MAX_ROUNDS = 3;
          for (let round = 0; round < MAX_ROUNDS; round++) {
            const resp = await client.chat.completions.create({
              model,
              max_tokens: 4096,
              messages: messages as any,
              tools,
              ...extra,
            });

            const msg = resp.choices[0]?.message;
            if (!msg) throw new Error("LLM 返回空 message");

            // 保留 reasoning_content（DeepSeek 要求回传）
            const assistantMsg: Record<string, unknown> = { role: "assistant", content: msg.content ?? "" };
            if ((msg as any).tool_calls) assistantMsg.tool_calls = (msg as any).tool_calls;
            if ((msg as any).reasoning_content) assistantMsg.reasoning_content = (msg as any).reasoning_content;
            messages.push(assistantMsg);

            const tc = (msg.tool_calls ?? []).find(
              (x: any) => x.type === "function" && x.function.name.startsWith("action_"),
            );
            if (tc && tc.type === "function") {
              actionType = actionTypeFromToolName(tc.function.name);
              if (!actionType) throw new Error(`无法从 tool name "${tc.function.name}" 提取 action type`);
              const parsed = PerActionSchema.safeParse(JSON.parse(tc.function.arguments));
              if (!parsed.success) throw new Error(`tool_call 参数不符合 schema：${parsed.error.message}`);
              p = parsed.data as Record<string, any>;
              break;
            }

            if (round < MAX_ROUNDS - 1) {
              messages.push({ role: "user", content: "请调用对应的 action_* 工具提交你的行动决定。不要输出纯文本，必须调用工具。" });
            }
          }

          if (!actionType || !p) {
            throw new Error(`LLM ${MAX_ROUNDS} 轮均未返回 tool_call`);
          }

          action = {
            type: actionType,
            actorId: c.id,
            targetId: p.target_id,
            targetNodeId: p.target_node_id,
            freeText: p.free_text,
            reasoning: p.reasoning,
            emotionTag: p.emotion_tag,
            selfImportance: p.self_importance,
            changeType: p.change_type,
            reason: p.reason,
            arrivalAction: p.arrival_action
              ? {
                  type: p.arrival_action.action_type,
                  freeText: p.arrival_action.free_text,
                  targetId: p.arrival_action.target_id,
                  targetNodeId: p.arrival_action.target_node_id,
                }
              : undefined,
          };
        } catch (err) {
          const msg =
            err instanceof OpenAI.APIError
              ? `${err.constructor.name} status=${err.status}: ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          action = fallbackWait(c, msg);
        }
      }
    } else {
      // 测试 stub：直接调用，不走真实 LLM
      action = await options.decide({
        character: c,
        nodes,
        here: ctx.here,
        companions: ctx.companions,
        reachable: ctx.reachable,
        perceived,
        options: opts,
        worldName: world.name,
        tick: fromTick,
        facts,
        language,
        ctx,
      });
    }
  } catch (err) {
    action = fallbackWait(
      c,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4. execute
  const exec = executeActions({
    worldId,
    tick: fromTick,
    characters,
    nodes,
    actions: [action],
  });

  // 5. 持久化
  appendEventsLog(worldId, exec.events);
  saveWorld(loaded); // 不动 currentTick
  appendThoughts(
    worldId,
    exec.resolvedActions.map((r) => ({
      characterId: r.action.actorId,
      tick: fromTick,
      action: r.action,
      success: r.success,
    })),
  );

  const resolved = exec.resolvedActions[0];
  return {
    action: resolved?.action ?? action,
    success: resolved?.success ?? false,
    events: exec.events,
  };
}
