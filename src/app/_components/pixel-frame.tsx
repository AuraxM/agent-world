"use client";

import type { ReactNode } from "react";

export function PixelFrame({
  children,
  tone = "default",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "danger";
  className?: string;
  title?: string | ReactNode;
}) {
  const toneClass =
    tone === "accent" ? "pixel-frame--accent"
    : tone === "danger" ? "pixel-frame--danger"
    : "";
  return (
    <section className={`pixel-frame ${toneClass} ${className}`}>
      {title && (
        <header className="px-3 py-1 text-game-sm tracking-widest uppercase text-(--color-pixel-muted) border-b border-(--color-pixel-border-dark) bg-(--color-pixel-bg-2)">
          {title}
        </header>
      )}
      {children}
    </section>
  );
}
