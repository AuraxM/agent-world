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
  DEFAULT_SLEEP_WINDOW,
  inSleepWindow,
  timeOfDay,
} from "../llm/index";
import { db, schema } from "../db/index";
import { loadAllCharacters, loadManifest, loadAllItems } from "../config/index";
import { actionRegistry } from "../domain/index";
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
  const { world, nodes, characters, shops } = loaded;
  const c = characters.find((x) => x.id === characterId);
  if (!c) throw new Error(`character not in world: ${characterId}`);

  const fromTick = world.currentTick;
  const itemDefsArr = loadAllItems(world.mapId);
  const itemDefs = new Map(itemDefsArr.map((d) => [d.id, d]));
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
  const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, world.epoch, isSleepHour, facts, undefined, shops, itemDefs);
  const opts = getAvailableActions(ctx);

  // 3. 决策（强制 arrivalIntro）
  const language = loadManifest(world.mapId).language;
  let action: Action;
  try {
    if (!options.decide) {
      const { llmDecide } = await import("../llm/index");
      const { hasApiKey: hk } = await import("../llm/index");
      if (!hk()) {
        action = fallbackLookAround(c, "没有激活的 LLM provider");
      } else {
        action = await llmDecide({
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
    shops,
    itemDefs,
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
