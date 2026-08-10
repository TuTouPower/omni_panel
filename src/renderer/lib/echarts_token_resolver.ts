import { useMemo, useSyncExternalStore } from "react";

/* eslint-disable react-hooks/rules-of-hooks */

export type ChartTheme = "dark" | "light";

export interface ChartPalette {
    accent: string;
    axis: string;
    axisLine: string;
    split: string;
    tipBg: string;
    tipBorder: string;
    tipText: string;
    font_body: string;
    font_code: string;
    tipShadow: string;
    centerV: string;
    centerL: string;
    sliceBorder: string;
    heat: string[];
    series: string[];
    agents: Record<string, string>;
    composition: Record<string, string>;
    dzBg: string;
    dzDataLine: string;
    dzDataArea: string;
    dzSelLine: string;
    dzSelArea: string;
    dzText: string;
    other: string;
}

const TOP_SERIES_TOKENS = [
    "--color-usage-1",
    "--color-usage-2",
    "--color-usage-3",
    "--color-usage-4",
    "--color-usage-5",
] as const;

const HEAT_TOKENS = [
    "--color-usage-1",
    "--color-usage-2",
    "--color-usage-3",
    "--color-usage-4",
    "--color-usage-5",
    "--color-usage-6",
    "--color-usage-7",
    "--color-usage-8",
] as const;

const FALLBACK_PALETTES: Record<ChartTheme, ChartPalette> = {
    light: {
        accent: "#3d7afd",
        axis: "#687085",
        axisLine: "#e6eaf1",
        split: "#eef1f6",
        tipBg: "#ffffff",
        tipBorder: "#e6eaf1",
        tipText: "#232a38",
        font_body: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
        font_code: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        tipShadow: "box-shadow:0 8px 24px rgba(30,40,80,.15); border-radius:8px;",
        centerV: "#232a38",
        centerL: "#9aa2b2",
        sliceBorder: "#ffffff",
        heat: [
            "#5b8cff",
            "#8b72f8",
            "#46c7c7",
            "#7ea2ff",
            "#a18cff",
            "#72d4d1",
            "#9cb8ff",
            "#b6a7ff",
        ],
        series: ["#5b8cff", "#8b72f8", "#46c7c7", "#7ea2ff", "#a18cff"],
        agents: {
            claude: "#e85d3d",
            grok: "#3b6fe0",
            opencode: "#1f9d66",
            kimi: "#4f6fe0",
        },
        composition: {
            cache_read: "#46c7c7",
            input: "#5b8cff",
            cache_write: "#f5772f",
            output: "#8b72f8",
        },
        dzBg: "#f1f4f9",
        dzDataLine: "#e6eaf1",
        dzDataArea: "#eef1f6",
        dzSelLine: "#3d7afd",
        dzSelArea: "rgba(61,122,253,0.16)",
        dzText: "#687085",
        other: "#9aa2b2",
    },
    dark: {
        accent: "#5b8dff",
        axis: "#a3abba",
        axisLine: "#2a2f3a",
        split: "#262b34",
        tipBg: "#181b22",
        tipBorder: "#2a2f3a",
        tipText: "#e9ecf3",
        font_body: '"Inter Variable", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
        font_code: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        tipShadow: "box-shadow:0 8px 24px rgba(0,0,0,.4); border-radius:8px;",
        centerV: "#e9ecf3",
        centerL: "#6c7382",
        sliceBorder: "#1f232c",
        heat: [
            "#5b8cff",
            "#8b72f8",
            "#46c7c7",
            "#7ea2ff",
            "#a18cff",
            "#72d4d1",
            "#9cb8ff",
            "#b6a7ff",
        ],
        series: ["#5b8cff", "#8b72f8", "#46c7c7", "#7ea2ff", "#a18cff"],
        agents: {
            claude: "#ff7a59",
            grok: "#5b8cff",
            opencode: "#3ecf8e",
            kimi: "#7f9cff",
        },
        composition: {
            cache_read: "#46c7c7",
            input: "#5b8cff",
            cache_write: "#ff9d5c",
            output: "#9a80ff",
        },
        dzBg: "#262b34",
        dzDataLine: "#2a2f3a",
        dzDataArea: "#262b34",
        dzSelLine: "#5b8dff",
        dzSelArea: "rgba(91,141,255,0.2)",
        dzText: "#a3abba",
        other: "#6c7382",
    },
};

let palette_revision = 0;
let observed_root: HTMLElement | null = null;
let observed_signature = "";
let observer: MutationObserver | null = null;
const revision_listeners = new Set<() => void>();

function current_root(): HTMLElement | null {
    return typeof document === "undefined" ? null : document.documentElement;
}

function root_signature(root: HTMLElement): string {
    return [
        root.getAttribute("data-theme") ?? "",
        root.getAttribute("class") ?? "",
        root.getAttribute("style") ?? "",
    ].join("|");
}

function ensure_observer(): void {
    const root = current_root();
    if (!root || typeof MutationObserver === "undefined") return;
    if (observed_root === root && observer) return;
    observer?.disconnect();
    observed_root = root;
    observed_signature = root_signature(root);
    observer = new MutationObserver(() => {
        const next = root_signature(root);
        if (next === observed_signature) return;
        observed_signature = next;
        palette_revision += 1;
        revision_listeners.forEach((listener) => {
            listener();
        });
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
}

export function get_chart_palette_revision(): number {
    ensure_observer();
    return palette_revision;
}

export function subscribe_chart_palette_revision(listener: () => void): () => void {
    ensure_observer();
    revision_listeners.add(listener);
    return () => {
        revision_listeners.delete(listener);
    };
}

/** Notify canvas consumers after a semantic theme/accent token changes. */
export function notify_chart_palette_change(): number {
    ensure_observer();
    palette_revision += 1;
    if (observed_root) observed_signature = root_signature(observed_root);
    revision_listeners.forEach((listener) => {
        listener();
    });
    return palette_revision;
}

function raw_css_value(root: HTMLElement, name: string): string {
    const inline = root.style.getPropertyValue(name).trim();
    if (typeof getComputedStyle !== "function") return inline;
    const computed = getComputedStyle(root).getPropertyValue(name).trim();
    return computed || inline;
}

function resolve_css_value(
    root: HTMLElement,
    name: string,
    seen: ReadonlySet<string> = new Set(),
): string {
    if (seen.has(name)) return "";
    const next_seen = new Set(seen);
    next_seen.add(name);
    const raw = raw_css_value(root, name);
    if (!raw) return "";

    const exact_var = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.*?)\s*)?\)$/s.exec(raw);
    if (exact_var) {
        const referenced = exact_var[1];
        const fallback = exact_var[2]?.trim() ?? "";
        if (referenced) {
            const resolved = resolve_css_value(root, referenced, next_seen);
            if (resolved) return resolved;
        }
        return fallback && !fallback.includes("var(") ? fallback : "";
    }

    if (raw.includes("var(")) {
        const replaced = raw.replace(
            /var\(\s*(--[\w-]+)\s*(?:,\s*(.*?)\s*)?\)/g,
            (...args: unknown[]) => {
                const referenced = typeof args[1] === "string" ? args[1] : "";
                const fallback = typeof args[2] === "string" ? args[2] : "";
                return (
                    (referenced ? resolve_css_value(root, referenced, next_seen) : "") ||
                    fallback.trim()
                );
            },
        );
        if (replaced.includes("var(")) return "";
        return replaced.trim();
    }

    return raw;
}

function resolved_token(
    root: HTMLElement | null,
    names: readonly string[],
    fallback: string,
): string {
    if (!root) return fallback;
    for (const name of names) {
        const value = resolve_css_value(root, name);
        if (value && !value.includes("var(") && !value.includes("color-mix(")) return value;
    }
    return fallback;
}

function alpha_color(color: string, alpha: number): string {
    const match = /^#([\da-f]{6})$/i.exec(color);
    if (match) {
        const value = match[1] ?? "";
        const red = Number.parseInt(value.slice(0, 2), 16);
        const green = Number.parseInt(value.slice(2, 4), 16);
        const blue = Number.parseInt(value.slice(4, 6), 16);
        return `rgba(${String(red)},${String(green)},${String(blue)},${String(alpha)})`;
    }
    const short = /^#([\da-f]{3})$/i.exec(color);
    if (short) {
        const value = short[1] ?? "";
        const red = Number.parseInt(`${value[0] ?? "0"}${value[0] ?? "0"}`, 16);
        const green = Number.parseInt(`${value[1] ?? "0"}${value[1] ?? "0"}`, 16);
        const blue = Number.parseInt(`${value[2] ?? "0"}${value[2] ?? "0"}`, 16);
        return `rgba(${String(red)},${String(green)},${String(blue)},${String(alpha)})`;
    }
    const rgb = /^rgba?\(([^)]+)\)$/i.exec(color);
    if (rgb) {
        const channels = (rgb[1] ?? "").split(",").map((part) => part.trim());
        if (channels.length >= 3) {
            return `rgba(${channels.slice(0, 3).join(",")},${String(alpha)})`;
        }
    }
    return color;
}

export function color_with_alpha(color: string, alpha: number): string {
    return alpha_color(color, Math.max(0, Math.min(1, alpha)));
}

export function resolve_chart_palette(
    theme: ChartTheme,
    root: HTMLElement | null = current_root(),
): ChartPalette {
    ensure_observer();
    const fallback = FALLBACK_PALETTES[theme];
    const surface_card = resolved_token(root, ["--color-surface-card"], fallback.sliceBorder);
    const accent = resolved_token(root, ["--color-accent", "--accent"], fallback.accent);
    const series = TOP_SERIES_TOKENS.map((name, index) =>
        resolved_token(root, [name], fallback.series[index] ?? fallback.accent),
    );
    const heat = HEAT_TOKENS.map((name, index) =>
        resolved_token(root, [name], fallback.heat[index] ?? fallback.accent),
    );
    const agents = {
        claude: resolved_token(
            root,
            ["--color-agent-claude"],
            fallback.agents["claude"] ?? fallback.other,
        ),
        grok: resolved_token(
            root,
            ["--color-agent-grok"],
            fallback.agents["grok"] ?? fallback.other,
        ),
        opencode: resolved_token(
            root,
            ["--color-agent-opencode"],
            fallback.agents["opencode"] ?? fallback.other,
        ),
        kimi: resolved_token(
            root,
            ["--color-agent-kimi"],
            fallback.agents["kimi"] ?? fallback.other,
        ),
    };
    const composition = {
        cache_read: resolved_token(
            root,
            ["--color-usage-3"],
            fallback.composition["cache_read"] ?? accent,
        ),
        input: resolved_token(root, ["--color-usage-1"], fallback.composition["input"] ?? accent),
        cache_write: resolved_token(
            root,
            ["--color-warning"],
            fallback.composition["cache_write"] ?? accent,
        ),
        output: resolved_token(root, ["--color-usage-2"], fallback.composition["output"] ?? accent),
    };
    const tip_bg = resolved_token(
        root,
        ["--color-menu-bg", "--color-surface-window"],
        fallback.tipBg,
    );
    return {
        accent,
        axis: resolved_token(root, ["--color-on-surface-variant"], fallback.axis),
        axisLine: resolved_token(root, ["--color-outline"], fallback.axisLine),
        split: resolved_token(root, ["--color-hairline"], fallback.split),
        tipBg: tip_bg,
        tipBorder: resolved_token(root, ["--color-outline"], fallback.tipBorder),
        tipText: resolved_token(root, ["--color-on-surface"], fallback.tipText),
        font_body: resolved_token(root, ["--font-body-md"], fallback.font_body),
        font_code: resolved_token(root, ["--font-code-md"], fallback.font_code),
        tipShadow: fallback.tipShadow,
        centerV: resolved_token(root, ["--color-on-surface"], fallback.centerV),
        centerL: resolved_token(root, ["--color-on-surface-muted"], fallback.centerL),
        sliceBorder: surface_card,
        heat,
        series,
        agents,
        composition,
        dzBg: resolved_token(root, ["--color-surface-raised"], fallback.dzBg),
        dzDataLine: resolved_token(root, ["--color-outline"], fallback.dzDataLine),
        dzDataArea: resolved_token(root, ["--color-hairline"], fallback.dzDataArea),
        dzSelLine: accent,
        dzSelArea: color_with_alpha(accent, theme === "dark" ? 0.2 : 0.16),
        dzText: resolved_token(root, ["--color-on-surface-muted"], fallback.dzText),
        other: resolved_token(root, ["--color-on-surface-muted"], fallback.other),
    };
}

export function top_category_color(index: number, theme: ChartTheme): string {
    return resolve_chart_palette(theme).series[index] ?? resolve_chart_palette(theme).other;
}

export function agent_color(agent: string, theme: ChartTheme): string {
    const palette = resolve_chart_palette(theme);
    const key = agent.replace(/[-_](code)$/, "");
    return palette.agents[key] ?? palette.accent;
}

export function palette_for(theme: ChartTheme): ChartPalette {
    return resolve_chart_palette(theme);
}

/** Compatibility spelling for renderer code that still uses the old helper style. */
export const paletteFor = palette_for;

export function use_chart_palette(theme: ChartTheme): { palette: ChartPalette; revision: number } {
    const revision = useSyncExternalStore(
        subscribe_chart_palette_revision,
        get_chart_palette_revision,
        get_chart_palette_revision,
    );
    const palette = useMemo(() => {
        void revision;
        return resolve_chart_palette(theme);
    }, [theme, revision]);
    return { palette, revision };
}

export function use_chart_palette_revision(): number {
    return useSyncExternalStore(
        subscribe_chart_palette_revision,
        get_chart_palette_revision,
        get_chart_palette_revision,
    );
}

/** Fallback palette export for pure data tests; runtime consumers should resolve CSS tokens. */
export const DEFAULT_CHART_PALETTES = FALLBACK_PALETTES;
