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
import { getLanguage } from "./settings";
import { db, schema } from "@/db/client";
import { loadAllCharacters } from "@/config/loader";
import { buildSystemPrompt, buildUserPrompt, timeOfDay } from "@/llm/prompt";
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

function buildHomeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.homeNodeId) m.set(tpl.id, tpl.homeNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}

/**
 * 加载某 worldId 在 tick=currentTick 的所有事件（用于刚被 addCharacterToWorld
 * 写入的 arrival 事件参与感知）。
 *
 * 注：events_log 表把整个 WorldEvent 序列化进 payload_json 列；这里直接解出。
 */
function loadEventsAtTick(worldId: string, tick: number): WorldEvent[] {
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
  const homeMap = buildHomeMap();
  const homeNodeId = homeMap.get(c.id) ?? null;
  c.homeNodeId = homeNodeId;

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
    homeNodeId,
  });
  const ctx = buildActionContext(c, nodes, characters);
  const dayInfo = timeOfDay(fromTick);
  const opts = getAvailableActions(ctx, {
    facts,
    isSleepHour: dayInfo.isSleepHour,
  });

  // 3. 决策（强制 arrivalIntro）
  const language = getLanguage();
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
          ACTION_TOOL_NAME,
          ActionSchema,
          ActionToolInputSchema,
        } = await import("@/domain/schemas");
        const { getThinkingEnabled } = await import("./settings");
        const OpenAI = (await import("openai")).default;

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
          const resp = await client.chat.completions.create({
            model: getModelName(),
            max_tokens: 4096,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: ACTION_TOOL_NAME,
                  description:
                    "提交你这一 tick 的行动。type 必须是封闭枚举之一；reasoning 必须显式引用一项你自己的性格特征（用文字描述，不要写数值）。",
                  parameters: ActionToolInputSchema,
                },
              },
            ],
            ...extra,
          });
          const tc = resp.choices[0]?.message?.tool_calls?.find(
            (x) => x.type === "function" && x.function.name === ACTION_TOOL_NAME,
          );
          if (!tc || tc.type !== "function") {
            throw new Error("LLM 没有返回 submit_action tool_call");
          }
          const parsed = ActionSchema.safeParse(JSON.parse(tc.function.arguments));
          if (!parsed.success) {
            throw new Error(`tool_call 参数不符合 ActionSchema：${parsed.error.message}`);
          }
          const p = parsed.data;
          action = {
            type: p.action_type,
            actorId: c.id,
            targetId: p.target_id,
            targetNodeId: p.target_node_id,
            freeText: p.free_text,
            reasoning: p.reasoning,
            emotionTag: p.emotion_tag,
            selfImportance: p.self_importance,
            changeType: p.change_type,
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
