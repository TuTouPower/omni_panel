/**
 * Token stats color system.
 *
 * Mirrors the MODEL_COLORS / PROJECT_COLORS / PALETTES definitions in
 * docs/design/index.html so the React implementation stays pixel-consistent
 * with the reference demo.
 */

/** 5 high-saturation colors for common models. */
export const MODEL_COLORS: Record<string, string> = {
    "claude-opus-4.5": "#7c6cf6",
    "claude-sonnet-4.5": "#4cc2ff",
    "deepseek-v4-pro": "#3ddc97",
    "kimi-k3": "#ffb454",
    "glm-4.7": "#f56cc6",
    // Tail models: lower saturation.
    "qwen3-coder-plus": "#5f7d95",
    "gpt-5.2": "#8d8a6d",
    "gemini-3-pro": "#8f7d9e",
    "llama-4-maverick": "#6d9a8a",
    "mistral-large-3": "#a08676",
    "codestral-2": "#7688a5",
    "phi-5-mini": "#94a078",
};

export const COMMON_MODELS = [
    "claude-opus-4.5",
    "claude-sonnet-4.5",
    "deepseek-v4-pro",
    "kimi-k3",
    "glm-4.7",
];

export const TAIL_MODELS = Object.keys(MODEL_COLORS).filter((m) => !COMMON_MODELS.includes(m));

/** Fixed project palette. */
export const PROJECT_COLORS: Record<string, string> = {
    "/home/testuser/omni_eval": "#7c6cf6",
    "/home/testuser/api-gateway": "#4cc2ff",
    "/home/testuser/web-console": "#3ddc97",
    "/home/testuser/llm-bench": "#ffb454",
    "/home/testuser/dotfiles": "#f56cc6",
    "/home/testuser/robot-firmware": "#9aa4b8",
};

/** Per-theme ECharts styling tokens. */
export interface ChartPalette {
    axis: string;
    axisLine: string;
    split: string;
    tipBg: string;
    tipBorder: string;
    tipText: string;
    tipShadow: string;
    centerV: string;
    centerL: string;
    sliceBorder: string;
    heat: string[];
    dzBg: string;
    dzDataLine: string;
    dzDataArea: string;
    dzSelLine: string;
    dzSelArea: string;
    dzText: string;
    other: string;
}

export const PALETTES: Record<"dark" | "light", ChartPalette> = {
    dark: {
        axis: "#5d6878",
        axisLine: "#1f2739",
        split: "#161d2c",
        tipBg: "#171e2e",
        tipBorder: "#2a3450",
        tipText: "#e6eaf2",
        tipShadow: "box-shadow:0 8px 24px rgba(0,0,0,.4); border-radius:8px;",
        centerV: "#e6eaf2",
        centerL: "#5d6878",
        sliceBorder: "#0b0e14",
        heat: ["#161d2c", "#2c2a55", "#5a4fd0", "#7c6cf6", "#a99bff"],
        dzBg: "#0f131c",
        dzDataLine: "#2a3450",
        dzDataArea: "#161d2c",
        dzSelLine: "#7c6cf6",
        dzSelArea: "#2c2a55",
        dzText: "#5d6878",
        other: "#46506a",
    },
    light: {
        axis: "#8a93a8",
        axisLine: "#dfe3ec",
        split: "#eef1f6",
        tipBg: "#ffffff",
        tipBorder: "#e3e7f0",
        tipText: "#1d2433",
        tipShadow: "box-shadow:0 8px 24px rgba(30,40,80,.15); border-radius:8px;",
        centerV: "#1d2433",
        centerL: "#98a0b4",
        sliceBorder: "#ffffff",
        heat: ["#eef1f6", "#d6d2f4", "#a79df0", "#7c6cf6", "#5a4fd0"],
        dzBg: "#f2f4f9",
        dzDataLine: "#d5dae6",
        dzDataArea: "#eef1f6",
        dzSelLine: "#7c6cf6",
        dzSelArea: "#d9d5f8",
        dzText: "#8a93a8",
        other: "#ccd3e0",
    },
};

export function modelColor(model: string, theme: "dark" | "light" = "dark"): string {
    return MODEL_COLORS[model] ?? PALETTES[theme].other;
}

export function projectColor(directory: string | null): string {
    return directory ? (PROJECT_COLORS[directory] ?? "#6b7890") : "#6b7890";
}

export function paletteFor(theme: "dark" | "light"): ChartPalette {
    return PALETTES[theme];
}

/**
 * High-contrast colors assigned to the top 5 models by usage, in descending
 * order. Unknown model names fall back to these; anything beyond the top 5
 * is collapsed into "其他" and uses the theme gray.
 */
export const TOP5_COLORS = ["#7c6cf6", "#4cc2ff", "#3ddc97", "#ffb454", "#f56cc6"];

export function colorForTopModel(model: string, index: number, theme: "dark" | "light"): string {
    if (index >= 0 && index < TOP5_COLORS.length) {
        return TOP5_COLORS[index] ?? MODEL_COLORS[model] ?? PALETTES[theme].other;
    }
    return MODEL_COLORS[model] ?? PALETTES[theme].other;
}
