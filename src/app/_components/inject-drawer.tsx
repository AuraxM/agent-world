"use client";

export function InjectDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-[420px] z-50 bg-(--panel) border-l-2 border-(--border) shadow-[inset_1px_0_0_var(--border-amber))] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-(--chrome-hi) to-(--chrome) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
          <span className="text-pixel-sm text-(--accent-strong) tracking-[var(--letter-pixel)]">
            ⚡ 投放事件
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-pixel-md text-(--text-on-frame-muted) hover:text-(--text-on-frame) cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form (placeholder) */}
        <div className="flex-1 overflow-y-auto pixel-scroll p-4 space-y-4">
          <Field label="地点" placeholder="当前节点 / 选择其他节点…" />
          <Field label="参与者" placeholder="选择 NPC（留空=随机）…" />
          <Field label="事件类型" placeholder="突发 / 社交 / 环境 / 任务…" />
          <Field label="强度 (1–5)" placeholder="3" />
          <Field label="自由文本" placeholder="描述你要注入的事件…" multiline />
          <Field label="可见范围" placeholder="节点内 / 父级 / 全图 / 私密" />
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-(--border) shadow-[inset_0_1px_0_var(--border-amber))]">
          <button
            type="button"
            disabled
            className="w-full py-2 text-pixel-sm text-(--panel) bg-(--border-amber) border border-(--border) cursor-not-allowed opacity-50 tracking-[var(--letter-pixel-tight)]"
          >
            投放 (Coming Soon)
          </button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  placeholder,
  multiline,
}: {
  label: string;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-pixel-xs text-(--text-muted) tracking-[var(--letter-pixel)] uppercase">
        {label}
      </span>
      {multiline ? (
        <textarea
          disabled
          placeholder={placeholder}
          rows={3}
          className="mt-1 w-full px-3 py-2 text-body-sm text-(--text) bg-(--frame) border border-(--border-amber) placeholder:text-(--text-faint) resize-none cursor-not-allowed opacity-60"
        />
      ) : (
        <input
          disabled
          placeholder={placeholder}
          className="mt-1 w-full px-3 py-2 text-body-sm text-(--text) bg-(--frame) border border-(--border-amber) placeholder:text-(--text-faint) cursor-not-allowed opacity-60"
        />
      )}
    </label>
  );
}
