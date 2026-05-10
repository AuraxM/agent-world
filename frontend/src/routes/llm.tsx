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
    (entryName: string, field: "providerId" | "thinkingEnabled", value: string | boolean) => {
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
      <div className="px-6 py-4 border-b-2 border-(--border)">
        <h2 className="text-(--accent-strong) text-body-lg font-bold">LLM 配置</h2>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">
        {loading ? (
          <div className="text-(--text-on-frame-muted)">加载中...</div>
        ) : (
          <>
            {/* Provider list */}
            <section className="pixel-frame">
              <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
                <h3 className="text-(--accent-strong) text-sm font-bold">Provider 管理</h3>
              </div>
              <div className="p-1">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-(--frame)/50"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.isActive ? "#4caf50" : "#5a4848" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-(--text-on-frame) text-xs font-bold">{p.name}</div>
                      <div className="text-(--text-on-frame-muted) text-[10px]">
                        {p.baseUrl} · {p.model}
                      </div>
                    </div>
                    {p.isActive && (
                      <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Entry Thinking config */}
            <section className="pixel-frame">
              <div className="px-4 py-3 border-b border-(--border)">
                <h3 className="text-(--accent-strong) text-sm font-bold">入口配置 & Thinking</h3>
              </div>
              <div>
                {entries.map((entry) => (
                  <div
                    key={entry.entryName}
                    className="flex items-center gap-4 px-3 py-2.5 border-b border-(--border)/30 last:border-b-0"
                  >
                    <div className="flex-1 text-(--text-on-frame) text-xs">
                      <code className="text-[11px]">{entry.entryName}</code>
                      <span className="text-(--text-on-frame-muted) ml-2">
                        — {ENTRY_LABELS[entry.entryName] ?? ""}
                      </span>
                    </div>
                    <select
                      value={entry.providerId ?? ""}
                      onChange={(e) =>
                        handleEntryChange(entry.entryName, "providerId", e.target.value || null)
                      }
                      className="text-xs bg-(--frame) text-(--text-on-frame) border border-(--border) rounded px-2 py-1 w-[150px]"
                    >
                      <option value="">默认 (Active Provider)</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-(--text-on-frame-muted) cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={entry.thinkingEnabled}
                        onChange={(e) =>
                          handleEntryChange(entry.entryName, "thinkingEnabled", e.target.checked)
                        }
                        className="accent-(--accent-strong)"
                      />
                      Thinking
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-sm cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                           bg-(--frame) hover:bg-(--accent-strong) hover:text-(--frame) rounded transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "保存中..." : "保存配置"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
