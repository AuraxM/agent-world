// Quick dialog test: does NPC express need to go home when tired?
import { loadWorld } from "../src/systems/store";
import { runDialogPhase, pairChatRequests, saveConversation, type AcceptDecideFn, type SummaryDecideFn, type SalvageDecideFn } from "../src/llm/dialog";
import { BUILTIN_ACTIONS } from "../src/systems/actions-builtin";
import { actionRegistry } from "../src/domain/action-system";
import { randomUUID } from "node:crypto";

// Register actions
for (const a of BUILTIN_ACTIONS) actionRegistry.register(a);

const worldId = "world-okinawa-trip";
const w = loadWorld(worldId);

// Find two characters at same location
const locationGroups = new Map<string, typeof w.characters>();
for (const c of w.characters) {
  const list = locationGroups.get(c.locationId) || [];
  list.push(c);
  locationGroups.set(c.locationId, list);
}

let charA: typeof w.characters[0] | undefined;
let charB: typeof w.characters[0] | undefined;
for (const [, chars] of locationGroups) {
  if (chars.length >= 2) { charA = chars[0]; charB = chars[1]; break; }
}
if (!charA || !charB) { console.log("No pair found"); process.exit(1); }

// Set up high fatigue + home for charA
charA.vitals = { hunger: 0, fatigue: 14, hygiene: 0 };
charA.restNodeId = charA.locationId; // home is here (simplified for test)
charA.sleepWindow = { start: 22, duration: 8 };
charA.activityNodeId = null;

console.log(`${charA.name} (fatigue=${charA.vitals.fatigue}, location=${charA.locationId}) ↔ ${charB.name}`);

// Run a single dialog turn
const convId = `conv-test-${randomUUID().slice(0, 8)}`;

const mockAccept: AcceptDecideFn = async ({ requesterId }) => ({
  type: "accept_chat" as const, targetId: requesterId, reasoning: "ok", selfImportance: 2,
});
const mockSummary: SummaryDecideFn = async () => ({ summary: "一段闲聊" });
const mockSalvage: SalvageDecideFn = async ({ character }) => ({
  type: "wait" as const, actorId: character.id, reasoning: "等等", selfImportance: 2,
  skipExecution: true, skipMemory: true,
});

const chatAction = {
  id: `act-chat-${randomUUID().slice(0, 8)}`,
  worldId, actorId: charA.id, actorName: charA.name,
  tick: w.world.currentTick, type: "chat", targetId: charB.id,
  freeText: "我们聊聊？", selfImportance: 2, displayName: "聊天",
};

console.log("\nRunning dialog phase...");
const result = await runDialogPhase({
  rawActions: [chatAction],
  characters: w.characters,
  nodes: w.nodes,
  perceptions: new Map(),
  tick: w.world.currentTick,
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
const conv = result.updatedConversations.find(c => c.id === convId || c.initiatorId === charA!.id);
if (conv) {
  for (const t of conv.transcript) {
    if (t.kind === "action_result") continue;
    const speakerName = t.speakerId === charA!.id ? charA!.name : charB!.name;
    console.log(`[${speakerName}] ${(t as any).line}`);
  }
}
console.log("\nDialog events:", result.dialogEvents.map(e => e.description).join("\n"));
console.log("Memory writes:", result.memoryWrites.map(m => m.memory.content).join("\n"));
