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
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar */}
      <nav className="w-14 flex-shrink-0 flex flex-col items-center pt-3 gap-1 bg-(--frame-2) border-r-2 border-(--border)">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center text-lg rounded-md transition-colors ${
                isActive
                  ? "bg-(--frame) border border-(--accent-strong) text-(--accent-strong)"
                  : "text-(--text-on-frame-muted) hover:text-(--text-on-frame) hover:bg-(--frame)"
              }`
            }
          >
            {item.icon}
          </NavLink>
        ))}

        <div className="flex-1" />

        {/* Home / Cover */}
        <button
          type="button"
          title="返回封面"
          onClick={() => navigate("/")}
          className="w-10 h-10 flex items-center justify-center text-base text-(--text-on-frame-muted) hover:text-(--text-on-frame) hover:bg-(--frame) rounded-md mb-3 cursor-pointer transition-colors"
        >
          🏠
        </button>
      </nav>

      {/* Content area */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
