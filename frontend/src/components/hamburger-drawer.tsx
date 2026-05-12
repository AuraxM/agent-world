"use client";

import { type ReactNode, useState } from "react";

export function HamburgerDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Top bar — mobile only */}
      <div className="md:hidden flex items-center px-4 py-2.5 border-b border-white/10 bg-black/30 flex-shrink-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-white/60 hover:text-white/90 transition-colors cursor-pointer p-1"
          aria-label="打开导航菜单"
        >
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="0" y1="1" x2="22" y2="1" />
            <line x1="0" y1="8" x2="22" y2="8" />
            <line x1="0" y1="15" x2="22" y2="15" />
          </svg>
        </button>
        <span className="ml-3 text-white/70 text-[13px] font-semibold tracking-[0.1em]">Hub</span>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-black/95 backdrop-blur-xl border-r border-white/10 transform transition-transform duration-250 ease md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-white/80 text-[12px] font-semibold tracking-[0.1em]">导航</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-white/40 hover:text-white/80 transition-colors cursor-pointer p-1"
            aria-label="关闭导航菜单"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="2" y1="2" x2="14" y2="14" />
              <line x1="14" y1="2" x2="2" y2="14" />
            </svg>
          </button>
        </div>
        {/* Any child click closes the drawer */}
        <div onClick={() => setOpen(false)} className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
