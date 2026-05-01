/**
 * GET  /api/admin/providers — 列出所有 provider
 * POST /api/admin/providers — 创建新 provider
 */
import { z } from "zod";
import {
  createProvider,
  listProviders,
} from "@/llm/providers";

const CreateBodySchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export async function GET() {
  try {
    const providers = listProviders();
    return Response.json({ providers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = CreateBodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const provider = createProvider(parsed.data);
    return Response.json({ provider }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
