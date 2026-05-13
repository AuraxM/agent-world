// Real night test: tick 110 = 22:00, sleep window starts
import { loadWorld } from "../src/systems/store";
import { llmDecide } from "../src/llm/decide";
import { buildActionContext, getAvailableActions } from "../src/systems/actions";
import { runDialogPhase, type AcceptDecideFn, type SummaryDecideFn, type SalvageDecideFn } from "../src/llm/dialog";
import { BUILTIN_ACTIONS } from "../src/systems/actions-builtin";
import { actionRegistry } from "../src/domain/action-system";
import { randomUUID } from "node:crypto";

for (const a of BUILTIN_ACTIONS) actionRegistry.register(a);

const worldId = "world-okinawa-trip";
const w = loadWorld(worldId);

// Use 伊藤凉 — inject home + night state
const c = w.characters.find(ch => ch.name.includes("伊藤"))!;
const peer = w.characters.find(ch => ch.name.includes("小林"))!;

// Find the right tick for 23:00. Use the world's actual epoch.
// 1 tick = 12 minutes. For 23:00, we need tick = 23 * 5 = 115 from midnight.
// But we need to find the current day's 23:00.
const MS_PER_TICK = (60 / 5) * 60 * 1000; // 720000ms = 12 min
const epochDate = new Date(w.world.epoch);
const epochHour = epochDate.getHours();
// Align to midnight of epoch date, then add 115 ticks (23 hours)
const midnightEpoch = new Date(epochDate.getFullYear(), epochDate.getMonth(), epochDate.getDate()).getTime();
const nightTick = Math.floor((midnightEpoch - w.world.epoch) / MS_PER_TICK) + 115;

console.log(`World epoch: ${epochDate.toISOString()}, midnight: ${new Date(midnightEpoch).toISOString()}`);
console.log(`nightTick: ${nightTick} (should be ~23:00)`);

// Verify the time
const testDate = new Date(w.world.epoch + nightTick * MS_PER_TICK);
console.log(`Time at tick ${nightTick}: ${testDate.getHours()}:${String(testDate.getMinutes()).padStart(2,'0')}`);

// Inject state
c.locationId = "hotel-dining";
c.vitals = { hunger: 2, fatigue: 10, hygiene: 3 }; // 明显疲劳
c.restNodeId = "room-305";
c.sleepWindow = { start: 22, duration: 8 };
c.currentAction = undefined;
c.activeConversationIds = [];
c.shortMemory = [];
peer.locationId = "hotel-dining";

const node = w.nodes.find(n => n.id === "hotel-dining")!;
const companions = w.characters.filter(ch => ch.id !== c.id && ch.locationId === c.locationId);

const facts = {
  activityNodeId: c.activityNodeId ?? null, activityNodeName: null,
  restNodeId: c.restNodeId, restNodeName: "305 花园房",
  hoursAtCurrentLocation: 0, todayActionCounts: {}, todayChatTargets: {},
};

console.log(`\n=== 测试1: 疲劳(10) + 深夜 + 不在家(餐厅) ===`);
console.log(`角色: ${c.name} | 疲劳: ${c.vitals.fatigue} | 位置: ${node.name} | 家: ${c.restNodeId}`);
console.log(`作息窗口: ${c.sleepWindow!.start}:00-${(c.sleepWindow!.start + c.sleepWindow!.duration) % 24}:00`);

const ctx = buildActionContext(c, w.nodes, w.characters, worldId, nightTick, w.world.epoch, true, facts as any, undefined, [], new Map());
const options = getAvailableActions(ctx);
console.log(`可用 actions: ${options.map(o => o.type).join(", ")}`);
console.log(`sleep 可见: ${options.some(o => o.type === "sleep")}`);
console.log(`move 可见: ${options.some(o => o.type === "move")}`);

const input = {
  character: c, nodes: w.nodes, here: node, companions,
  reachable: w.nodes.filter(n => n.id !== node.id),
  perceived: [], options,
  worldName: w.world.name, tick: nightTick, epoch: w.world.epoch,
  facts: facts as any, language: "zh" as const, ctx,
  allCharacters: w.characters, activeEventDefs: [], upcomingNotebookText: "",
};

console.log("\n调用 llmDecide...\n");
const action = await llmDecide(input as any);
console.log(`\n>>> LLM 选择: ${(action as any).type}${(action as any).targetNodeId ? " → " + (action as any).targetNodeId : ""}`);
console.log(`>>> reasoning: ${((action as any).reasoning ?? "").slice(0, 300)}`);
