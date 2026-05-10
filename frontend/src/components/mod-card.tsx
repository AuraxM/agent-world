import { useNavigate } from "react-router-dom";

export interface ModInfo {
  id: string;
  name: string;
  description: string;
  language: string;
  characterCount: number;
  backgroundImage?: string | null;
}

const LANG_LABEL: Record<string, string> = {
  zh: "中",
  en: "EN",
  ja: "日",
};

export function ModCard({ mod }: { mod: ModInfo }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/hub/worlds?mod=${encodeURIComponent(mod.id)}`)}
      className="relative h-[130px] rounded-md overflow-hidden border border-white/10 cursor-pointer
                 hover:border-(--accent-strong) hover:-translate-y-0.5 hover:shadow-lg
                 transition-all text-left w-full"
    >
      {/* Frosted glass overlay on left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[55%] flex flex-col justify-center px-4 py-3 z-10
                   bg-black/40 backdrop-blur-md
                   border-r border-white/10"
      >
        <div className="text-(--accent-strong) text-sm font-bold mb-1 truncate">
          {mod.name}
        </div>
        <div className="text-white/50 text-[10px] mb-1.5 flex gap-2">
          <span>{LANG_LABEL[mod.language] ?? mod.language}</span>
          <span>{mod.characterCount} 角色</span>
        </div>
        <div className="text-white/80 text-[11px] leading-snug line-clamp-2">
          {mod.description}
        </div>
      </div>
      {/* Right side — card background image */}
      {mod.backgroundImage && (
        <img
          src={mod.backgroundImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </button>
  );
}
