import { useNavigate } from "react-router-dom";

/**
 * Landing overlay on top of the cover background.
 * Shows the title + ENTER WORLD button.
 * Clicking the button navigates to /hub/mods — the cover stays as background.
 */
export default function CoverOverlay() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-10">
      <h1
        className="text-pixel-xl tracking-[0.25em]"
        style={{ color: "var(--color-pixel-accent, #c8b898)", textShadow: "0 0 20px rgba(200,184,152,0.3)" }}
      >
        AGENT WORLD
      </h1>

      <button
        type="button"
        onClick={() => navigate("/hub/mods")}
        className="px-12 py-4 text-pixel-lg tracking-[0.2em] cursor-pointer
                   bg-black/50 backdrop-blur-sm border-3 border-(--accent-strong) text-(--accent-strong)
                   hover:bg-(--accent-strong) hover:text-black
                   transition-colors"
      >
        ENTER WORLD
      </button>
    </div>
  );
}
