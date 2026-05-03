import {
  getThinkingEnabled,
  setThinkingEnabled,
} from "@/engine/settings";

export async function GET() {
  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
  });
}

export async function POST(request: Request) {
  let body: { thinkingEnabled?: boolean; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body.thinkingEnabled === "boolean") {
    setThinkingEnabled(body.thinkingEnabled);
  }
  // language field is now ignored — language is determined by the map pack

  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
  });
}
