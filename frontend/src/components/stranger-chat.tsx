"use client";

import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface ChatMessage {
  id: string;
  role: "user" | "npc";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

interface Character {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// StrangerChat Component
// ---------------------------------------------------------------------------

export function StrangerChat({
  worldId,
  characters,
  loading: tickLoading,
}: {
  worldId: string;
  characters: Character[];
  loading: boolean;
}) {
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selectedCharId || tickLoading) return;

    setInput("");
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await fetch(`/api/worlds/${worldId}/stranger-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedCharId,
          message: text,
          sessionId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `${res.status}` }));
        const npcMsg: ChatMessage = {
          id: `n-${Date.now()}`,
          role: "npc",
          content: `错误：${err.error ?? res.status}`,
        };
        setMessages((prev) => [...prev, npcMsg]);
        return;
      }

      const data = await res.json();

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      const npcMsg: ChatMessage = {
        id: `n-${Date.now()}`,
        role: "npc",
        content: data.reply,
        reasoning: data.reasoning || undefined,
        toolCalls: data.toolCalls?.length ? data.toolCalls : undefined,
      };
      setMessages((prev) => [...prev, npcMsg]);
    } catch (err) {
      const npcMsg: ChatMessage = {
        id: `n-${Date.now()}`,
        role: "npc",
        content: `网络错误：${err instanceof Error ? err.message : String(err)}`,
      };
      setMessages((prev) => [...prev, npcMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const toggleExpand = (msgId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const handleCharChange = (charId: string) => {
    setSelectedCharId(charId);
    setSessionId(null);
    setMessages([]);
  };

  const selectedCharName = characters.find((c) => c.id === selectedCharId)?.name;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Character selector */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-white/10 bg-black/15">
        <select
          value={selectedCharId ?? ""}
          onChange={(e) => handleCharChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-[12px] text-white/90 focus:outline-none focus:border-(--accent-strong)/50"
        >
          <option value="" disabled>
            选择角色…
          </option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && selectedCharId && (
          <div className="text-center text-white/25 text-[12px] mt-8">
            以陌生人的身份与 {selectedCharName} 开始对话
          </div>
        )}
        {messages.length === 0 && !selectedCharId && (
          <div className="text-center text-white/25 text-[12px] mt-8">
            选择一个角色，开始对话
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 ${
                msg.role === "user"
                  ? "bg-(--accent-strong)/15 text-white/90"
                  : "bg-white/5 text-white/85 border border-white/10"
              }`}
            >
              <div className="text-[9px] text-white/35 mb-0.5">
                {msg.role === "user" ? "陌生人" : selectedCharName ?? "NPC"}
              </div>

              <div className="text-[12px] leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>

              {(msg.reasoning || msg.toolCalls) && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => toggleExpand(msg.id)}
                    className="text-[10px] text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                  >
                    {expandedMessages.has(msg.id) ? "▼" : "▶"} 思考过程
                    {msg.toolCalls ? `（${msg.toolCalls.length} 个工具调用）` : ""}
                  </button>

                  {expandedMessages.has(msg.id) && (
                    <div className="mt-1.5 space-y-1.5">
                      {msg.reasoning && (
                        <div className="bg-black/20 rounded p-2">
                          <div className="text-[9px] text-white/30 mb-1">推理</div>
                          <div className="text-[10px] text-white/60 whitespace-pre-wrap leading-relaxed">
                            {msg.reasoning}
                          </div>
                        </div>
                      )}

                      {msg.toolCalls?.map((tc, i) => (
                        <div key={i} className="bg-black/20 rounded p-2">
                          <div className="text-[9px] text-(--accent-strong)/60 mb-1 font-mono">
                            {tc.name}
                          </div>
                          <div className="text-[9px] text-white/30 mb-0.5">
                            参数: {JSON.stringify(tc.args)}
                          </div>
                          <div className="text-[9px] text-white/40 whitespace-pre-wrap break-all">
                            返回值: {JSON.stringify(tc.result, null, 1)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <div className="text-[9px] text-white/35 mb-0.5">{selectedCharName ?? "NPC"}</div>
              <div className="text-[12px] text-white/40 animate-pulse">正在思考…</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-white/10 p-3 bg-black/15">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!selectedCharId || tickLoading || sending}
            rows={1}
            placeholder={
              tickLoading
                ? "Tick 运行中，请等待…"
                : !selectedCharId
                  ? "请先选择角色"
                  : "输入消息…"
            }
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-[12px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-(--accent-strong)/50 disabled:opacity-30 disabled:cursor-not-allowed resize-none"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!selectedCharId || !input.trim() || tickLoading || sending}
            className="px-4 py-1.5 bg-(--accent-strong)/15 border border-(--accent-strong)/25 rounded text-[12px] text-(--accent-strong) hover:bg-(--accent-strong)/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
