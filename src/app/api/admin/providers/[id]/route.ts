/**
 * PATCH  /api/admin/providers/[id] — 更新 provider
 * DELETE /api/admin/providers/[id] — 删除 provider
 */
import { z } from "zod";
import {
  deleteProvider,
  getProvider,
  updateProvider,
  maskApiKey,
} from "@/llm/providers";

const UpdateBodySchema = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

function toPublic(p: ReturnType<typeof getProvider>) {
  if (!p) return undefined;
  return { ...p, apiKey: maskApiKey(p.apiKey) };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = UpdateBodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const provider = updateProvider(id, parsed.data);
    return Response.json({ provider: toPublic(provider) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("provider not found")) {
      return Response.json({ error: message }, { status: 404 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const existing = getProvider(id);
    if (!existing) {
      return Response.json({ error: "provider not found" }, { status: 404 });
    }
    if (existing.isActive) {
      return Response.json(
        { error: "cannot delete the active provider" },
        { status: 400 },
      );
    }
    deleteProvider(id);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
