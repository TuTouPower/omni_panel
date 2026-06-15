import type { UsageProvider } from "../../shared/schemas/plugin-output";

export const ADD_COMMON_SERVICES: { id: UsageProvider; label: string }[] = [
    { id: "claude", label: "Claude" },
    { id: "codex", label: "Codex" },
    { id: "gemini", label: "Gemini" },
    { id: "glm", label: "GLM" },
    { id: "kimi", label: "Kimi" },
    { id: "deepseek", label: "DeepSeek" },
    { id: "tavily", label: "Tavily" },
    { id: "mimo", label: "MiMo" },
    { id: "brave", label: "Brave Search" },
];
