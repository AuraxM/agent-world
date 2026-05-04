import {
  listEntryConfigs,
  batchUpsertEntryConfigs,
  getDefaultProviderId,
  getProvider,
} from "@/llm/providers";

const ALL_ENTRY_NAMES = [
  "decide",
  "salvage",
  "dialog_turn",
  "dialog_summarize",
  "accept_decision",
  "character_placement",
  "memory_compress",
];

export async function GET() {
  try {
    const entryConfigs = listEntryConfigs(ALL_ENTRY_NAMES);
    let defaultProvider: { id: string; name: string; model: string } | null = null;
    try {
      const dpId = getDefaultProviderId();
      const dp = getProvider(dpId);
      if (dp) {
        defaultProvider = { id: dp.id, name: dp.name, model: dp.model };
      }
    } catch {
      // no default provider set
    }
    return Response.json({ entryConfigs, defaultProvider });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  let body: { entryConfigs?: { entryName: string; providerId: string | null; thinkingEnabled: boolean }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.entryConfigs || !Array.isArray(body.entryConfigs)) {
    return Response.json({ error: "entryConfigs array required" }, { status: 400 });
  }

  try {
    batchUpsertEntryConfigs(body.entryConfigs);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
