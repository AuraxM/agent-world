// Quick test: real character state, no induction
import { loadWorld } from "../src/systems/store";
import { llmDecide } from "../src/llm/decide";
import { buildActionContext, getAvailableActions } from "../src/systems/actions";

const worldId = "world-okinawa-trip";
const w = loadWorld(worldId);

// Pick a character with natural state
const c = w.characters.find((ch: { name: string }) => ch.name.includes("山田"));
if (!c) { console.log("char not found"); process.exit(1); }

const node = w.nodes.find((n: { id: string }) => n.id === c.locationId)!;
const companions = w.characters.filter((ch: { id: string }) => ch.id !== c.id && ch.locationId === c.locationId);
const facts = {
  activityNodeId: (c as any).activityNodeId ?? null, activityNodeName: null,
  restNodeId: (c as any).restNodeId ?? null, restNodeName: null,
  hoursAtCurrentLocation: 0, todayActionCounts: {} as Record<string, number>, todayChatTargets: {} as Record<string, number>,
};

console.log("角色:", c.name);
console.log("疲劳:", c.vitals.fatigue, "饥饿:", c.vitals.hunger);
console.log("位置:", node.name, "tags:", node.tags);
console.log("restNodeId:", (c as any).restNodeId);
console.log("sleepWindow:", (c as any).sleepWindow);

const ctx = buildActionContext(c, w.nodes, w.characters, worldId, w.world.currentTick, w.world.epoch, true, facts as any, undefined, [], new Map());
const options = getAvailableActions(ctx);
console.log("可用 actions:", options.map((o: any) => o.type).join(", "));
console.log("sleep 可见:", options.some((o: any) => o.type === "sleep"));
console.log("move 可见:", options.some((o: any) => o.type === "move"));

console.log("\n调用 llmDecide...");
const action = await llmDecide({
  character: c, nodes: w.nodes, here: node, companions,
  reachable: w.nodes.filter((n: { id: string }) => n.id !== node.id),
  perceived: [], options,
  worldName: w.world.name, tick: w.world.currentTick, epoch: w.world.epoch,
  facts: facts as any, language: "zh" as const, ctx,
  allCharacters: w.characters, activeEventDefs: [], upcomingNotebookText: "",
} as any);
console.log("LLM 选择:", action.type, (action as any).targetNodeId ? "→ " + (action as any).targetNodeId : "");
console.log("reasoning:", ((action as any).reasoning ?? "").slice(0, 300));
