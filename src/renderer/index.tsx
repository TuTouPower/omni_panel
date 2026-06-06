import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { register_renderer_log_transport } from "./lib/logger-transport";
import "./styles/globals.css";

register_renderer_log_transport(window.usageboard);

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
