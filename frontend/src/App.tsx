import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CoverBackground } from "@/components/cover-background";
import CoverOverlay from "@/routes/cover";
import HubPage from "@/routes/hub";
import ModGallery from "@/routes/mods";
import WorldsPanel from "@/routes/worlds";
import LLMConfig from "@/routes/llm";
import WorldViewPage from "@/routes/world-view";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Cover background wraps landing, hub, and world view */}
        <Route element={<CoverBackground />}>
          <Route index element={<CoverOverlay />} />
          <Route path="hub" element={<HubPage />}>
            <Route index element={<Navigate to="mods" replace />} />
            <Route path="mods" element={<ModGallery />} />
            <Route path="worlds" element={<WorldsPanel />} />
            <Route path="llm" element={<LLMConfig />} />
          </Route>
          <Route path="world/:id" element={<WorldViewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
