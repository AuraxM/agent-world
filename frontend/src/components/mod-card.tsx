import { useNavigate } from "react-router-dom";

export interface ModInfo {
  id: string;
  name: string;
  description: string;
  language: string;
  characterCount: number;
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
      className="relative h-[130px] rounded-md overflow-hidden border-2 border-(--border) cursor-pointer
                 hover:border-(--accent-strong) hover:-translate-y-0.5 hover:shadow-lg
                 transition-all text-left w-full"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-linear-to-br from-(--frame) to-(--frame-2)" />

      {/* Frosted glass overlay on left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[55%] flex flex-col justify-center px-4 py-3
                   bg-(--frame)/70 backdrop-blur-[10px] -webkit-backdrop-blur-[10px]
                   border-r border-(--border)/20"
      >
        <div className="text-(--accent-strong) text-sm font-bold mb-1 truncate">
          {mod.name}
        </div>
        <div className="text-(--text-on-frame-muted) text-[10px] mb-1.5 flex gap-2">
          <span>{LANG_LABEL[mod.language] ?? mod.language}</span>
          <span>{mod.characterCount} 角色</span>
        </div>
        <div className="text-(--text-on-frame) text-[11px] leading-snug line-clamp-2">
          {mod.description}
        </div>
      </div>
    </button>
  );
}
