import { createRoot } from "react-dom/client";
import { StrictMode } from "react";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found in index.html");

createRoot(root).render(
  <StrictMode>
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      Agent World frontend skeleton — code migration pending.
    </div>
  </StrictMode>
);
