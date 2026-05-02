// src/app/_components/theme-switcher.tsx
"use client";

import { useTheme } from "../_hooks/use-theme";

export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`w-7 h-7 bg-(--border-amber) text-(--panel) border border-(--border) text-sm cursor-pointer ${className}`}
      title={theme === "light" ? "切到暗主题" : "切到亮主题"}
    >
      {theme === "light" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
    </button>
  );
}
