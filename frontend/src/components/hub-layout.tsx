import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useState } from "react";

/** 8x8 pixel art icon — each string is a row, "X" = filled pixel */
function PixelIcon({ data, className }: { data: string[]; className?: string }) {
  const size = 8;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      shapeRendering="crispEdges"
      fill="currentColor"
    >
      {data.map((row, y) =>
        [...row].map((ch, x) =>
          ch === "X" ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}

const PIXEL_ICONS = {
  mods: [
    "........",
    ".XX.XX..",
    ".XX.XX..",
    "........",
    ".XX.XX..",
    ".XX.XX..",
    "........",
    "........",
  ],
  worlds: [
    "...XX...",
    "..X..X..",
    ".X....X.",
    ".X.XX.X.",
    ".X.XX.X.",
    ".X....X.",
    "..X..X..",
    "...XX...",
  ],
  llm: [
    "...XX...",
    "..XXXX..",
    "..XXX...",
    ".XXXXX..",
    "...XXXX.",
    "....XX..",
    "...XXX..",
    "........",
  ],
  home: [
    "...XX...",
    "..XXXX..",
    ".XXXXXX.",
    "XXXXXXXX",
    "XX....XX",
    "XX.XX.XX",
    "XXXXXXXX",
    "........",
  ],
} as const;

const NAV_ITEMS = [
  { to: "/hub/mods", label: "Mods", icon: PIXEL_ICONS.mods },
  { to: "/hub/worlds", label: "Worlds", icon: PIXEL_ICONS.worlds },
  { to: "/hub/llm", label: "LLM", icon: PIXEL_ICONS.llm },
] as const;

export function HubLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-full animate-fade-in relative">
      {/* Left sidebar — PC only */}
      <nav className="hidden md:flex w-14 flex-shrink-0 flex-col items-center pt-3 gap-1 bg-black/30 backdrop-blur-md border-r border-white/10">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
                isActive
                  ? "bg-white/10 border border-(--accent-strong) text-(--accent-strong)"
                  : "text-white/50 hover:text-white hover:bg-white/10"
              }`
            }
          >
            <PixelIcon data={[...item.icon]} className="w-5 h-5" />
          </NavLink>
        ))}

        <div className="flex-1" />

        <button
          type="button"
          title="返回封面"
          onClick={() => navigate("/")}
          className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-md mb-3 cursor-pointer transition-colors"
        >
          <PixelIcon data={[...PIXEL_ICONS.home]} className="w-5 h-5" />
        </button>
      </nav>

      {/* Content area */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>

      {/* Mobile floating nav button + popup menu */}
      <div className="md:hidden fixed bottom-5 left-5 z-50">
        {/* Popup menu */}
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-14 left-0 z-50 bg-black/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-lg py-1 min-w-[140px]">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 text-[12px] transition-colors ${
                      isActive
                        ? "bg-white/[0.08] text-(--accent-strong)"
                        : "text-white/70 hover:text-white hover:bg-white/[0.04]"
                    }`
                  }
                >
                  <PixelIcon data={[...item.icon]} className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                </NavLink>
              ))}
              <div className="border-t border-white/10 mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => { navigate("/"); setMenuOpen(false); }}
                  className="flex items-center gap-3 px-4 py-2.5 text-[12px] text-white/40 hover:text-white transition-colors cursor-pointer w-full"
                >
                  <PixelIcon data={[...PIXEL_ICONS.home]} className="w-5 h-5 flex-shrink-0" />
                  返回封面
                </button>
              </div>
            </div>
          </>
        )}

        {/* FAB button */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="w-12 h-12 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-white/70 hover:text-white hover:border-white/25 flex items-center justify-center cursor-pointer transition-all shadow-lg"
          aria-label="导航菜单"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            {menuOpen ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
