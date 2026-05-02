import {
  getLanguage,
  getThinkingEnabled,
  isSupportedLanguage,
  setLanguage,
  setThinkingEnabled,
} from "@/engine/settings";

export async function GET() {
  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
    language: getLanguage(),
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
  if (body.language !== undefined) {
    if (!isSupportedLanguage(body.language)) {
      return Response.json(
        { error: "unsupported language; must be one of zh/en/ja" },
        { status: 400 },
      );
    }
    setLanguage(body.language);
  }

  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
    language: getLanguage(),
  });
}
