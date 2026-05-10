import { useNavigate } from "react-router-dom";

export default function CoverOverlay() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full flex flex-col items-center gap-10" style={{ paddingTop: "33vh" }}>
      <h1
        className="tracking-[0.25em]"
        style={{
          fontFamily: "var(--font-silkscreen, monospace)",
          fontSize: "144px",
          color: "var(--color-pixel-accent, #c8b898)",
          textShadow: "0 0 30px rgba(200,184,152,0.3)",
        }}
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
