"use client";

type Tab = "stream" | "gantt" | "chat" | "map";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "stream", label: "事件", icon: "📋" },
  { key: "gantt", label: "甘特", icon: "📊" },
  { key: "chat", label: "对话", icon: "💬" },
  { key: "map", label: "地图", icon: "🗺" },
];

export function BottomTabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <div className="flex md:hidden border-t border-white/10 bg-black/30 flex-shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-colors ${
            active === tab.key
              ? "text-(--accent-strong) border-t-2 border-(--accent-strong) -mt-px"
              : "text-white/35 border-t-2 border-transparent"
          }`}
        >
          <span className="text-[15px] leading-none">{tab.icon}</span>
          <span className="text-[9px] mt-0.5 tracking-[0.05em]">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
