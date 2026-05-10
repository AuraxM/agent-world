import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/hub/mods", label: "Mods", icon: "🎭" },
  { to: "/hub/worlds", label: "Worlds", icon: "🌍" },
  { to: "/hub/llm", label: "LLM", icon: "⚡" },
] as const;

export function HubLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="flex h-full animate-fade-in">
      {/* Left sidebar — semi-transparent */}
      <nav className="w-14 flex-shrink-0 flex flex-col items-center pt-3 gap-1 bg-black/30 backdrop-blur-md border-r border-white/10">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center text-lg rounded-md transition-colors ${
                isActive
                  ? "bg-white/10 border border-(--accent-strong) text-(--accent-strong)"
                  : "text-white/50 hover:text-white hover:bg-white/10"
              }`
            }
          >
            {item.icon}
          </NavLink>
        ))}

        <div className="flex-1" />

        {/* Home button */}
        <button
          type="button"
          title="返回封面"
          onClick={() => navigate("/")}
          className="w-10 h-10 flex items-center justify-center text-base text-white/40 hover:text-white hover:bg-white/10 rounded-md mb-3 cursor-pointer transition-colors"
        >
          🏠
        </button>
      </nav>

      {/* Content area — transparent, cover shows through */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
