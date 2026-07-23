import type { UsageProvider } from "../../shared/schemas/plugin-output";

export type AddServiceId = UsageProvider | "cpa";

export const ADD_COMMON_SERVICES: { id: AddServiceId; label: string }[] = [
    { id: "claude", label: "Claude" },
    { id: "codex", label: "Codex" },
    { id: "antigravity", label: "Antigravity" },
    { id: "glm", label: "GLM" },
    { id: "kimi", label: "Kimi" },
    { id: "deepseek", label: "DeepSeek" },
    { id: "getoneapi", label: "GetOneAPI" },
    { id: "minimax", label: "MiniMax" },
    { id: "tavily", label: "Tavily" },
    { id: "firecrawl", label: "Firecrawl" },
    { id: "exa", label: "Exa" },
    { id: "tikhub", label: "TikHub" },
    { id: "mimo", label: "MiMo" },
    { id: "opencode_go", label: "OpenCode Go" },
    { id: "grok", label: "Grok" },
    { id: "cpa", label: "CPA Manager" },
];
