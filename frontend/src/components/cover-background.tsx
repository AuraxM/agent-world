import { Outlet, useLocation } from "react-router-dom";

/**
 * Persistent full-screen cover background.
 * On / (index): sharp image, darker overlay.
 * On /hub/*: blurred + lightened image, lighter overlay.
 * Transition animates smoothly between the two states.
 */
export function CoverBackground() {
  const location = useLocation();
  const isHub = location.pathname.startsWith("/hub");

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Background image */}
      <img
        src="/cover.png"
        alt=""
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${
          isHub ? "blur-lg scale-105 brightness-150" : "blur-0 scale-100 brightness-100"
        }`}
      />

      {/* Dark overlay */}
      <div
        className={`absolute inset-0 transition-all duration-1000 ${
          isHub ? "bg-black/20" : "bg-black/40"
        }`}
      />

      {/* Foreground content */}
      <div className="relative z-10 h-full w-full">
        <Outlet />
      </div>
    </div>
  );
}
