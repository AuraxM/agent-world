import { useCallback, useEffect, useState } from "react";

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
}

interface ProvidersResponse { providers: LLMProvider[] }
interface EntryConfigsResponse { entryConfigs: EntryConfig[]; defaultProvider: { id: string; name: string; model: string } | null }

const ENTRY_LABELS: Record<string, string> = {
  decide: "主决策",
  salvage: "失败恢复",
  dialog_turn: "对话回合",
  dialog_summarize: "对话摘要",
  dialog_personal_memory: "个人记忆",
  accept_decision: "提案接受",
  character_placement: "角色放置",
  memory_compress: "记忆压缩",
};

export default function LLMConfigPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [entries, setEntries] = useState<EntryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  const handleEntryChange = useCallback(
    (entryName: string, field: "providerId" | "thinkingEnabled", value: string | boolean | null) => {
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-sm flex items-center justify-between">
        <h2 className="text-(--accent-strong) text-body-lg font-bold">LLM 配置</h2>
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
                  </div>
                ))}
              </div>
            </div>

            {/* Entry config cards */}
            <div>
              <div className="text-white/30 text-[10px] uppercase tracking-wider mb-3 px-1">
                入口配置 & Thinking
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
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
