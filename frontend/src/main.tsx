import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "@/App";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found in index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
