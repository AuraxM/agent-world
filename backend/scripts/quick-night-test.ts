// Test: low fatigue + night → go home? night + dialog → mention going home?
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

// Use 伊藤凉 — set up home at 305花园房, current location at 餐厅, night time
const c = w.characters.find(ch => ch.name.includes("伊藤"))!;
const peer = w.characters.find(ch => ch.name.includes("小林"))!;

// Inject: low fatigue, home = 305, at 餐厅, night (tick 110 = 22:00)
c.locationId = "hotel-dining";
c.vitals = { hunger: 2, fatigue: 6, hygiene: 3 }; // 有点累, not critical
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

// Use tick 115 = 23:00 (within sleep window 22-6)
console.log("=== 测试1: 低疲劳(6) + 深夜(23:00) + 不在家(餐厅) ===\n");
console.log(`角色: ${c.name} | 疲劳: ${c.vitals.fatigue} | 位置: ${node.name} | 家: ${c.restNodeId}`);
console.log(`作息窗口: ${c.sleepWindow!.start}:00-${(c.sleepWindow!.start + c.sleepWindow!.duration) % 24}:00 | tick: 115`);

const ctx = buildActionContext(c, w.nodes, w.characters, worldId, 115, w.world.epoch, true, facts as any, undefined, [], new Map());
const options = getAvailableActions(ctx);
console.log(`可用 actions: ${options.map(o => o.type).join(", ")}`);
console.log(`sleep 可见: ${options.some(o => o.type === "sleep")}`);
console.log(`move 可见: ${options.some(o => o.type === "move")}`);

const input = {
  character: c, nodes: w.nodes, here: node, companions,
  reachable: w.nodes.filter(n => n.id !== node.id),
  perceived: [], options,
  worldName: w.world.name, tick: 115, epoch: w.world.epoch,
  facts: facts as any, language: "zh" as const, ctx,
  allCharacters: w.characters, activeEventDefs: [], upcomingNotebookText: "",
};

console.log("\n调用 llmDecide...\n");
const action = await llmDecide(input as any);
console.log(`\n>>> LLM 选择: ${(action as any).type}${(action as any).targetNodeId ? " → " + (action as any).targetNodeId : ""}`);
console.log(`>>> reasoning: ${((action as any).reasoning ?? "").slice(0, 300)}`);

// ── Test 2: dialog at night ──
console.log("\n\n=== 测试2: 深夜 + 对话中 + 低疲劳 ===\n");

// Set higher fatigue for dialog test to make it noticeable
c.vitals.fatigue = 9;
console.log(`角色: ${c.name} | 疲劳: ${c.vitals.fatigue} | 位置: ${node.name} | 家: ${c.restNodeId}`);

const mockAccept: AcceptDecideFn = async ({ requesterId }) => ({
  type: "accept_chat" as const, targetId: requesterId, reasoning: "ok", selfImportance: 2,
});
const mockSummary: SummaryDecideFn = async () => ({ summary: "一段闲聊" });
const mockSalvage: SalvageDecideFn = async ({ character: ch }) => ({
  type: "wait" as const, actorId: ch.id, reasoning: "等等", selfImportance: 2,
  skipExecution: true, skipMemory: true,
});

const chatAction = {
  id: `act-chat-${randomUUID().slice(0, 8)}`,
  worldId, actorId: peer.id, actorName: peer.name,
  tick: 115, type: "chat", targetId: c.id,
  freeText: "这么晚了还在餐厅啊？", selfImportance: 2, displayName: "聊天",
};

console.log("\nRunning dialog phase...\n");
const result = await runDialogPhase({
  rawActions: [chatAction],
  characters: w.characters,
  nodes: w.nodes,
  perceptions: new Map(),
  tick: 115,
  epoch: w.world.epoch,
  worldName: w.world.name,
  worldDescription: "",
  language: "zh" as const,
  acceptDecide: mockAccept,
  summaryDecide: mockSummary,
  salvageDecide: mockSalvage,
  ongoingConversations: [],
});

console.log("\n=== Transcript ===");
const conv = result.updatedConversations[0];
if (conv) {
  for (const t of conv.transcript) {
    if (t.kind === "action_result") continue;
    const speakerName = t.speakerId === c.id ? c.name : peer.name;
    console.log(`[${speakerName}] ${(t as any).line}`);
  }
}
