import type { UsageProvider } from "../../shared/schemas/plugin-output";

export type AddServiceId = UsageProvider | "cpa";

export interface ProviderMeta {
    readonly id: AddServiceId;
    readonly label: string;
    readonly addServiceLabel?: string;
    readonly order: number;
}

// A101: 前端厂商元数据与顺序的单一真相源
export const PROVIDER_DEFINITIONS: readonly ProviderMeta[] = [
    { id: "claude", label: "Claude", order: 0 },
    { id: "codex", label: "Codex", order: 1 },
    { id: "antigravity", label: "Antigravity", order: 2 },
    { id: "glm", label: "GLM", order: 3 },
    { id: "kimi", label: "Kimi", order: 4 },
    { id: "kimi_web", label: "Kimi Web", order: 5 },
    { id: "deepseek", label: "DeepSeek", order: 6 },
    { id: "getoneapi", label: "GetOneAPI", order: 7 },
    { id: "minimax", label: "MiniMax", order: 8 },
    { id: "tavily", label: "Tavily", order: 9 },
    { id: "firecrawl", label: "Firecrawl", order: 10 },
    { id: "exa", label: "Exa", order: 11 },
    { id: "tikhub", label: "TikHub", order: 12 },
    { id: "mimo", label: "MiMo", order: 13 },
    { id: "opencode_go", label: "OpenCode Go", order: 14 },
    { id: "grok", label: "Grok", order: 15 },
    { id: "grok_bot", label: "Grok Bot", order: 16 },
    { id: "commandcode", label: "Command Code", order: 17 },
    { id: "muse", label: "Muse AI", order: 18 },
    { id: "cpa", label: "CPA", addServiceLabel: "CPA Manager", order: 19 },
];

export const PROVIDER_ORDER: readonly string[] = PROVIDER_DEFINITIONS.filter(
    (p) => p.id !== "cpa",
).map((p) => p.id);

// A120: 模块级 Map rank 避免热路径 O(N) 遍历
export const PROVIDER_ORDER_MAP: ReadonlyMap<string, number> = new Map(
    PROVIDER_ORDER.map((id, index) => [id, index]),
);

export const PROVIDER_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
    PROVIDER_DEFINITIONS.map((p) => [p.id, p.label]),
);

export const ADD_COMMON_SERVICES: { id: AddServiceId; label: string }[] = PROVIDER_DEFINITIONS.map(
    (p) => ({
        id: p.id,
        label: p.addServiceLabel ?? p.label,
    }),
);
