import { Outlet } from "react-router-dom";

/**
 * Persistent full-screen cover background.
 * Wraps both the landing overlay (/) and the hub content (/hub/*).
 */
export function CoverBackground() {
  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Background image */}
      <img
        src="/cover.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Dark overlay — dims the background so content is readable */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Foreground content */}
      <div className="relative z-10 h-full w-full">
        <Outlet />
      </div>
    </div>
  );
}
