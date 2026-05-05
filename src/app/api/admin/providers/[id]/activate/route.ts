/**
 * POST /api/admin/providers/[id]/activate — 切换活跃 provider
 */
import { setActiveProvider, maskApiKey } from "@/llm/providers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const provider = setActiveProvider(id);
    return Response.json({ provider: { ...provider, apiKey: maskApiKey(provider.apiKey) } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("provider not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
