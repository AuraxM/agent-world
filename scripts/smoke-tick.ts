import { tick } from "@/engine/tick";

const DEFAULT_WORLD_ID = "world-morning-town";

async function main() {
  const worldId = process.argv[2] ?? DEFAULT_WORLD_ID;
  const r = await tick(worldId, { forceWait: true });
  console.log(
    JSON.stringify(
      {
        fromTick: r.fromTick,
        toTick: r.toTick,
        eventCount: r.events.length,
        eventCategories: r.events.reduce<Record<string, number>>((acc, e) => {
          acc[e.category] = (acc[e.category] ?? 0) + 1;
          return acc;
        }, {}),
        decisions: r.decisions.map((d) => ({
          c: d.characterId,
          t: d.action.type,
          ok: d.success,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
