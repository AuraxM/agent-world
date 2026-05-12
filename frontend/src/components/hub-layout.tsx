import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { HamburgerDrawer } from "./hamburger-drawer";

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

  return (
    <div className="flex h-full animate-fade-in">
      {/* Left sidebar — semi-transparent */}
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

        {/* Home button */}
        <button
          type="button"
          title="返回封面"
          onClick={() => navigate("/")}
          className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 rounded-md mb-3 cursor-pointer transition-colors"
        >
          <PixelIcon data={[...PIXEL_ICONS.home]} className="w-5 h-5" />
        </button>
      </nav>

      {/* Mobile hamburger nav */}
      <HamburgerDrawer>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-[12px] transition-colors ${
                isActive
                  ? "bg-white/[0.08] text-(--accent-strong) border-l-2 border-(--accent-strong)"
                  : "text-white/50 hover:text-white hover:bg-white/[0.04] border-l-2 border-transparent"
              }`
            }
          >
            <PixelIcon data={[...item.icon]} className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto border-t border-white/10 pt-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-3 px-4 py-3 text-[12px] text-white/40 hover:text-white transition-colors cursor-pointer w-full"
          >
            <PixelIcon data={[...PIXEL_ICONS.home]} className="w-5 h-5" />
            返回封面
          </button>
        </div>
      </HamburgerDrawer>

      {/* Content area — transparent, cover shows through */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
