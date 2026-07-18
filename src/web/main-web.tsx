import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../renderer/App";
import { install_web_usageboard } from "./usageboard-web";
import "../renderer/styles/globals.css";

// Wire window.usageboard to the local-api HTTP bridge before the App mounts,
// so every component sees the same surface the Electron preload provides.
install_web_usageboard();

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
