import { Suspense } from "react";
import { WorldView } from "@/components/world-view";

export default function WorldViewPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-(--text-on-frame-muted) text-body-lg">加载中…</div>}>
      <WorldView />
    </Suspense>
  );
}
