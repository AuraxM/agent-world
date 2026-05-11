import { Outlet, useLocation } from "react-router-dom";

/**
 * Persistent full-screen cover background.
 * On / (index): sharp image, darker overlay.
 * On /hub/*: blurred + lightened image, lighter overlay.
 * Transition animates smoothly between the two states.
 */
export function CoverBackground() {
  const location = useLocation();
  const isIndex = location.pathname === "/";

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Background image */}
      <img
        src="/cover.png"
        alt=""
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${
          isIndex ? "blur-0 scale-100 brightness-100" : "blur-lg scale-105 brightness-110"
        }`}
      />

      {/* Dark overlay */}
      <div
        className={`absolute inset-0 transition-all duration-1000 ${
          isIndex ? "bg-black/40" : "bg-black/30"
        }`}
      />

      {/* Foreground content */}
      <div className="relative z-10 h-full w-full">
        <Outlet />
      </div>
    </div>
  );
}
