import { useNavigate } from "react-router-dom";

export default function CoverPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center relative overflow-hidden bg-black">
      {/* Background cover image */}
      <img
        src="/cover.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-10">
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
                     bg-(--frame)/80 border-3 border-(--accent-strong) text-(--accent-strong)
                     hover:bg-(--accent-strong) hover:text-(--frame)
                     transition-colors"
        >
          ENTER WORLD
        </button>
      </div>
    </div>
  );
}
