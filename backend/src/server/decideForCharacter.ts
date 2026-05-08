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
import {
  buildActionContext,
  getAvailableActions,
  executeActions,
  deriveAggregatedFacts,
  dispatchPerception,
  appendEventsLog,
  appendThoughts,
  loadRecentThoughts,
  loadWorld,
  saveWorld,
  buildActivityNodeMap,
  buildRestNodeMap,
} from "../systems/index";
import {
  getEntryConfig,
  buildSystemPrompt,
  buildUserPrompt,
  DEFAULT_SLEEP_WINDOW,
  inSleepWindow,
  timeOfDay,
} from "../llm/index";
import { db, schema } from "../db/index";
import { loadAllCharacters, loadManifest } from "../config/index";
import { actionRegistry, actionTypeFromToolName } from "../domain/index";
import type { Action, Character, WorldEvent } from "../domain/index";
import type { DecideInput } from "../llm/index";
import { createLogger } from "../shared/index";

const log = createLogger("character-placement");

const FACTS_LOOKBACK_TICKS = 48;

export interface DecideForCharacterResult {
  action: Action;
  success: boolean;
  events: WorldEvent[];
}

function fallbackLookAround(c: Character, reason: string): Action {
  return {
    type: "look_around",
    actorId: c.id,
    reasoning: `LLM 调用失败：${reason}`,
    selfImportance: 1,
  };
}

function normalizeArrivalType(raw: string): string {
  const stripped = actionTypeFromToolName(raw) ?? raw;
  return actionRegistry.has(stripped) ? stripped : "think";
}

function getSleepWindow(characterId: string) {
  try {
    const tpl = loadAllCharacters().find((t) => t.id === characterId);
    return tpl?.sleepWindow ?? DEFAULT_SLEEP_WINDOW;
  } catch {
    return DEFAULT_SLEEP_WINDOW;
  }
}

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
  const baseTime = timeOfDay(fromTick, world.epoch);
  const isSleepHour = inSleepWindow(baseTime.hour, sleepWindow);
  const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, world.epoch, isSleepHour, facts);
  const opts = getAvailableActions(ctx);

  // 3. 决策（强制 arrivalIntro）
  const language = loadManifest(world.mapId).language;
  let action: Action;
  try {
    if (!options.decide) {
      const { hasApiKey, getLLMClientForEntry, getModelNameForEntry } = await import(
        "../llm/index"
      );
      if (!hasApiKey()) {
        action = fallbackLookAround(c, "没有激活的 LLM provider");
      } else {
        const {
          buildPerActionSchema,
          buildActionTools,
          actionTypeFromToolName: atftn,
        } = await import("../domain/index");
        const OpenAI = (await import("openai")).default;
        const PerActionSchema = buildPerActionSchema();
        const tools = buildActionTools(ctx);

        const system = buildSystemPrompt({
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
          epoch: world.epoch,
          facts,
          language,
          arrivalIntro: true,
          allCharacters: characters,
          nodes,
        });

        let lastRespSnapshot = "(no response)";
        try {
          const config = getEntryConfig("character_placement");
          const client = getLLMClientForEntry("character_placement");
          const model = getModelNameForEntry("character_placement");
          const extra: Record<string, unknown> = {};
          if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

          const messages: Array<Record<string, unknown>> = [
            { role: "system", content: system },
            { role: "user", content: user },
          ];

          let actionType: string | null = null;
          type PerActionData = ReturnType<typeof PerActionSchema.parse> & {
            scheduled_day?: number;
            scheduled_hour?: number;
            scheduled_minute?: number;
          };
          let p: PerActionData | null = null;

          interface ToolCallLike {
            type?: string;
            function?: { name?: string; arguments?: string };
          }
          interface AssistantMsgLike {
            role?: string;
            content?: unknown;
            tool_calls?: ToolCallLike[];
            reasoning_content?: unknown;
          }

          const MAX_ROUNDS = 3;
          for (let round = 0; round < MAX_ROUNDS; round++) {
            const resp = await client.chat.completions.create({
              model,
              max_tokens: 16384,
              messages: messages as unknown as Parameters<typeof client.chat.completions.create>[0]["messages"],
              tools,
              ...extra,
            });
            lastRespSnapshot = resp ? JSON.stringify({
              choices: resp.choices?.map((ch) => ({
                finish_reason: ch.finish_reason,
                message: {
                  role: ch.message?.role,
                  content: typeof ch.message?.content === "string" ? ch.message.content.slice(0, 2000) : ch.message?.content,
                  tool_calls: ch.message?.tool_calls?.map((tc: ToolCallLike) => ({
                    name: tc.function?.name,
                    args: tc.function?.arguments?.slice(0, 500),
                  })),
                },
              })),
            }).slice(0, 4000) : "(no response)";

            const msg = resp.choices[0]?.message as AssistantMsgLike | undefined;
            if (!msg) throw new Error(`LLM 返回空 message。响应：${lastRespSnapshot}`);

            const assistantMsg: Record<string, unknown> = { role: "assistant", content: msg.content ?? "" };
            if (msg.tool_calls) assistantMsg.tool_calls = msg.tool_calls;
            if (msg.reasoning_content) assistantMsg.reasoning_content = msg.reasoning_content;
            messages.push(assistantMsg);

            const tc = (msg.tool_calls ?? []).find(
              (x: ToolCallLike) => x.type === "function" && x.function?.name?.startsWith("action_"),
            );
            if (tc && tc.type === "function" && tc.function?.name && tc.function?.arguments !== undefined) {
              actionType = atftn(tc.function.name);
              if (!actionType) throw new Error(`无法从 tool name "${tc.function.name}" 提取 action type`);
              const parsed = PerActionSchema.safeParse(JSON.parse(tc.function.arguments));
              if (!parsed.success) throw new Error(`tool_call 参数不符合 schema：${parsed.error.message}`);
              p = parsed.data as PerActionData;
              break;
            }

            if (round < MAX_ROUNDS - 1) {
              messages.push({ role: "user", content: "请调用对应的 action_* 工具提交你的行动决定。不要输出纯文本，必须调用工具。" });
            }
          }

          if (!actionType || !p) {
            throw new Error(`LLM ${MAX_ROUNDS} 轮均未返回 tool_call。最后响应：${lastRespSnapshot}`);
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
                  type: normalizeArrivalType(p.arrival_action.action_type),
                  freeText: p.arrival_action.free_text,
                  targetId: p.arrival_action.target_id,
                  targetNodeId: p.arrival_action.target_node_id,
                }
              : undefined,
            scheduled_day: p.scheduled_day,
            scheduled_hour: p.scheduled_hour,
            scheduled_minute: p.scheduled_minute,
          };
        } catch (err) {
          const msg =
            err instanceof OpenAI.APIError
              ? `${err.constructor.name} status=${err.status}: ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          log.warn("角色放置决策 LLM 失败", {
            角色: c.name,
            error: msg,
            llmResponse: lastRespSnapshot,
          });
          action = fallbackLookAround(c, msg);
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
        epoch: world.epoch,
        facts,
        language,
        ctx,
        allCharacters: characters,
        activeEventDefs: [],
        upcomingNotebookText: "",
      });
    }
  } catch (err) {
    action = fallbackLookAround(
      c,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4. execute
  const exec = executeActions({
    worldId,
    tick: fromTick,
    epoch: world.epoch,
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
