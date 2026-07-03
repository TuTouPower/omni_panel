import type { UsageProvider } from "../../shared/schemas/plugin-output";

export const ADD_COMMON_SERVICES: { id: UsageProvider; label: string }[] = [
    { id: "claude", label: "Claude" },
    { id: "codex", label: "Codex" },
    { id: "antigravity", label: "Antigravity" },
    { id: "glm", label: "GLM" },
    { id: "kimi", label: "Kimi" },
    { id: "deepseek", label: "DeepSeek" },
    { id: "tavily", label: "Tavily" },
    { id: "mimo", label: "MiMo" },
    { id: "opencode_go", label: "OpenCode Go" },
];
