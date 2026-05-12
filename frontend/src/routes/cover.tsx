import { useNavigate } from "react-router-dom";

export default function CoverOverlay() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full relative">
      {/* Title — center aligned at 1/3 from top */}
      <h1
        className="absolute left-1/2 tracking-[0.25em] whitespace-nowrap text-[48px] md:text-[144px]"
        style={{
          top: "33.33%",
          transform: "translate(-50%, -50%)",
          fontFamily: "var(--font-silkscreen, monospace)",
          color: "#fff",
          textShadow: "0 0 30px rgba(255,255,255,0.4)",
        }}
      >
        AGENT WORLD
      </h1>

      {/* Button — center aligned at 2/3 from top (1/3 from bottom) */}
      <button
        type="button"
        onClick={() => navigate("/hub/mods")}
        className="absolute left-1/2 px-12 py-4 text-pixel-lg tracking-[0.2em] cursor-pointer
                   bg-black/50 backdrop-blur-sm border-3 border-(--accent-strong) text-(--accent-strong)
                   hover:bg-(--accent-strong) hover:text-black
                   transition-colors whitespace-nowrap"
        style={{
          top: "66.67%",
          transform: "translate(-50%, -50%)",
        }}
      >
        ENTER WORLD
      </button>
    </div>
  );
}
