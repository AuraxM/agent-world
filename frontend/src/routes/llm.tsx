import { useCallback, useEffect, useRef, useState } from "react";

interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

interface EntryConfig {
  entryName: string;
  providerId: string | null;
  thinkingEnabled: boolean;
  timeBudgetMs?: number;
}

interface ProvidersResponse { providers: LLMProvider[] }
interface EntryConfigsResponse { entryConfigs: EntryConfig[]; defaultProvider: { id: string; name: string; model: string } | null }

const ENTRY_LABELS: Record<string, string> = {
  decide: "主决策",
  dialog_turn: "对话回合",
  dialog_summarize: "对话摘要",
  accept_decision: "提案接受",
};

type FormMode = "add" | "edit";

export default function LLMConfigPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [entries, setEntries] = useState<EntryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Provider form dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<FormMode>("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [pRes, eRes] = await Promise.all([
      fetch("/api/admin/providers"),
      fetch("/api/admin/entry-configs"),
    ]);
    const pData: ProvidersResponse = await pRes.json();
    const eData: EntryConfigsResponse = await eRes.json();
    setProviders(pData.providers);
    setEntries(eData.entryConfigs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Focus name input when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [dialogOpen]);

  const handleEntryChange = useCallback(
    (entryName: string, field: "providerId" | "thinkingEnabled" | "timeBudgetMs", value: string | boolean | number | null) => {
      setEntries((prev) =>
        prev.map((e) => (e.entryName === entryName ? { ...e, [field]: value } : e)),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    await fetch("/api/admin/entry-configs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryConfigs: entries }),
    });
    setSaving(false);
  }, [entries]);

  // ---- provider CRUD ----

  const openAddDialog = useCallback(() => {
    setDialogMode("add");
    setEditingId(null);
    setFormName("");
    setFormBaseUrl("");
    setFormApiKey("");
    setFormModel("");
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((p: LLMProvider) => {
    setDialogMode("edit");
    setEditingId(p.id);
    setFormName(p.name);
    setFormBaseUrl(p.baseUrl);
    setFormApiKey("");
    setFormModel(p.model);
    setFormError(null);
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formName.trim() || !formBaseUrl.trim() || !formModel.trim()) {
      setFormError("名称、Base URL、Model 为必填项");
      return;
    }
    if (dialogMode === "add" && !formApiKey.trim()) {
      setFormError("API Key 为必填项");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const body: Record<string, string> = {
      name: formName.trim(),
      baseUrl: formBaseUrl.trim(),
      model: formModel.trim(),
    };
    if (formApiKey.trim()) {
      body.apiKey = formApiKey.trim();
    }

    try {
      const url = dialogMode === "add"
        ? "/api/admin/providers"
        : `/api/admin/providers/${editingId}`;
      const method = dialogMode === "add" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setDialogOpen(false);
        load();
      } else {
        const data = await res.json().catch(() => ({ error: "操作失败" }));
        setFormError(data.error ?? "操作失败");
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }, [formName, formBaseUrl, formApiKey, formModel, dialogMode, editingId, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("确定删除此 provider？")) return;
    try {
      const res = await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
      if (res.ok) {
        load();
      } else {
        const data = await res.json().catch(() => ({ error: "删除失败" }));
        alert(data.error ?? "删除失败");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  }, [load]);

  const handleActivate = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/providers/${id}/activate`, { method: "POST" });
      if (res.ok) {
        load();
      } else {
        const data = await res.json().catch(() => ({ error: "启用失败" }));
        alert(data.error ?? "启用失败");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "启用失败");
    }
  }, [load]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-sm flex items-center justify-between">
        <h2 className="text-(--accent-strong) text-body-lg font-bold">LLM 配置</h2>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={openAddDialog}
            className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                       bg-black/30 hover:bg-(--accent-strong) hover:text-black rounded transition-colors"
          >
            + 添加 Provider
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-1.5 text-xs cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                       bg-black/30 backdrop-blur-sm hover:bg-(--accent-strong) hover:text-black rounded
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">
        {loading ? (
          <div className="text-white/50">加载中...</div>
        ) : (
          <>
            {/* Provider cards */}
            <div>
              <div className="text-white/30 text-[10px] uppercase tracking-wider mb-3 px-1">
                Provider 管理
              </div>
              <div className="flex flex-col gap-2.5">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-5 py-3.5 bg-black/25 backdrop-blur-md border border-white/10 rounded-md"
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.isActive ? "#4caf50" : "#5a4848" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 text-sm font-bold">{p.name}</div>
                      <div className="text-white/40 text-[11px]">
                        {p.baseUrl} · {p.model}
                      </div>
                    </div>
                    {p.isActive && (
                      <span className="text-[10px] text-green-300 bg-green-500/15 px-2 py-0.5 rounded-full">
                        运行中
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 ml-1">
                      {!p.isActive && (
                        <button
                          type="button"
                          onClick={() => handleActivate(p.id)}
                          className="text-[10px] px-2 py-1 border border-green-400/30 text-green-300
                                     hover:bg-green-500/10 rounded transition-colors cursor-pointer"
                        >
                          启用
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditDialog(p)}
                        className="text-[10px] px-2 py-1 border border-white/15 text-white/50
                                   hover:text-white hover:border-white/25 rounded transition-colors cursor-pointer"
                      >
                        编辑
                      </button>
                      {!p.isActive && (
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="text-[10px] px-2 py-1 border border-red-400/20 text-red-300
                                     hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Entry config cards */}
            <div>
              <div className="text-white/30 text-[10px] uppercase tracking-wider mb-3 px-1">
                入口配置 & 时间预算
              </div>
              <div className="flex flex-col gap-2.5">
                {entries.map((entry) => (
                  <div
                    key={entry.entryName}
                    className="flex items-center gap-4 px-5 py-3.5 bg-black/25 backdrop-blur-md border border-white/10 rounded-md"
                  >
                    <div className="flex-1 min-w-0">
                      <code className="text-white/80 text-xs">{entry.entryName}</code>
                      <span className="text-white/30 text-[11px] ml-2">
                        — {ENTRY_LABELS[entry.entryName] ?? ""}
                      </span>
                    </div>
                    <select
                      value={entry.providerId ?? ""}
                      onChange={(e) =>
                        handleEntryChange(entry.entryName, "providerId", e.target.value || null)
                      }
                      className="text-xs bg-black/30 text-white/80 border border-white/10 rounded px-2.5 py-1.5 w-[150px]
                                 backdrop-blur-sm outline-none focus:border-(--accent-strong)"
                    >
                      <option value="">默认 (Active)</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer whitespace-nowrap select-none">
                      <input
                        type="checkbox"
                        checked={entry.thinkingEnabled}
                        onChange={(e) =>
                          handleEntryChange(entry.entryName, "thinkingEnabled", e.target.checked)
                        }
                        className="accent-(--accent-strong) scale-110"
                      />
                      Thinking
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-white/50 select-none">
                      <span className="whitespace-nowrap">预算</span>
                      <input
                        type="number"
                        min={500}
                        max={60000}
                        step={500}
                        value={entry.timeBudgetMs ?? 5000}
                        onChange={(e) =>
                          handleEntryChange(entry.entryName, "timeBudgetMs", Number(e.target.value))
                        }
                        className="w-[70px] px-1.5 py-1 text-xs text-white/80 bg-black/30 border border-white/10 rounded
                                   backdrop-blur-sm outline-none focus:border-(--accent-strong)
                                   [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-white/30">ms</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Provider form dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { if (!submitting) setDialogOpen(false); }}
        >
          <div
            className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-lg p-6 w-[420px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-(--accent-strong) text-sm font-bold mb-4">
              {dialogMode === "add" ? "新建 Provider" : "编辑 Provider"}
            </h3>

            <div className="flex flex-col gap-3">
              <input
                ref={nameInputRef}
                type="text"
                value={formName}
                onChange={(e) => { setFormName(e.target.value); setFormError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="名称"
                disabled={submitting}
                className="w-full px-3 py-2 text-sm text-white/90 bg-black/30 border border-white/10 rounded
                           placeholder:text-white/20 outline-none focus:border-(--accent-strong)
                           disabled:opacity-40"
              />
              <input
                type="text"
                value={formBaseUrl}
                onChange={(e) => { setFormBaseUrl(e.target.value); setFormError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="Base URL（如 https://api.deepseek.com）"
                disabled={submitting}
                className="w-full px-3 py-2 text-sm text-white/90 bg-black/30 border border-white/10 rounded
                           placeholder:text-white/20 outline-none focus:border-(--accent-strong)
                           disabled:opacity-40"
              />
              <input
                type="password"
                value={formApiKey}
                onChange={(e) => { setFormApiKey(e.target.value); setFormError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder={dialogMode === "add" ? "API Key" : "API Key（留空则不修改）"}
                disabled={submitting}
                className="w-full px-3 py-2 text-sm text-white/90 bg-black/30 border border-white/10 rounded
                           placeholder:text-white/20 outline-none focus:border-(--accent-strong)
                           disabled:opacity-40"
              />
              <input
                type="text"
                value={formModel}
                onChange={(e) => { setFormModel(e.target.value); setFormError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="Model（如 deepseek-v4-flash）"
                disabled={submitting}
                className="w-full px-3 py-2 text-sm text-white/90 bg-black/30 border border-white/10 rounded
                           placeholder:text-white/20 outline-none focus:border-(--accent-strong)
                           disabled:opacity-40"
              />
            </div>

            {formError && (
              <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2.5 mt-4">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDialogOpen(false)}
                className="px-4 py-1.5 text-xs text-white/50 hover:text-white border border-white/10 rounded
                           bg-transparent hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="px-5 py-1.5 text-xs border border-(--accent-strong) text-(--accent-strong)
                           bg-black/30 hover:bg-(--accent-strong) hover:text-black rounded transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
