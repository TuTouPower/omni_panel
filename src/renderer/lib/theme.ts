import { useEffect, useState } from "react";
import { notify_chart_palette_change } from "./echarts_token_resolver";

function apply_theme(is_dark: boolean) {
    const root = document.documentElement;
    const next_theme = is_dark ? "dark" : "light";
    if (root.getAttribute("data-theme") === next_theme) return;
    root.setAttribute("data-theme", next_theme);
    notify_chart_palette_change();
}

type ThemeMode = "light" | "dark" | "system";

function resolve_theme_mode(mode: ThemeMode | undefined): boolean {
    const resolved_mode = mode ?? "system";
    return resolved_mode === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : resolved_mode === "dark";
}

function apply_theme_mode(mode: ThemeMode | undefined): void {
    apply_theme(resolve_theme_mode(mode));
}

/**
 * t268: 五档预设 accent 的 light/dark 值（DESIGN.md Colors 节）。
 * 预设 hex → 对应 accent key；自定义 hex → base 色（派生 strong/container/ring 由
 * color-mix 在 CSS 完成）；非法/缺失 → blue。
 */
const ACCENT_PRESETS: Record<string, string> = {
    "#3d7afd": "blue",
    "#6f5cf6": "purple",
    "#0ea5a3": "teal",
    "#f5772f": "orange",
    "#e23744": "red",
};

export function apply_accent(accent_color: string | undefined) {
    const root = document.documentElement;
    const preset = accent_color ? ACCENT_PRESETS[accent_color.toLowerCase()] : undefined;
    let accent_var: string;
    if (preset !== undefined) {
        accent_var = `var(--accent-${preset})`;
    } else {
        accent_var = accent_color ?? "var(--accent-blue)";
    }
    // 非法 hex 回落 blue（CSS var 无法校验，这里在 JS 端做格式校验）。
    const is_valid_hex = /^#[0-9a-f]{6}$/i.test(accent_color ?? "");
    const final_accent: string = preset
        ? accent_var
        : is_valid_hex
          ? (accent_color ?? "var(--accent-blue)")
          : "var(--accent-blue)";
    if (root.style.getPropertyValue("--accent").trim() === final_accent) return;
    root.style.setProperty("--accent", final_accent);
    notify_chart_palette_change();
}

export function useTheme() {
    // Subscribe before reading the initial snapshot. A push event received first
    // makes the in-flight snapshot stale and prevents it from rolling the theme back.
    useEffect(() => {
        let active = true;
        let event_generation = 0;
        const initial_generation = event_generation;
        const unsubscribe_config = window.usageboard.event.onConfigChange?.((config) => {
            if (!active) return;
            event_generation += 1;
            apply_theme_mode(config.theme);
            apply_accent(config.accentColor);
        });
        const unsubscribe_theme = window.usageboard.event.onThemeChange((isDark) => {
            if (!active) return;
            event_generation += 1;
            apply_theme(isDark);
        });
        void window.usageboard.config
            .get()
            .then(({ config }) => {
                if (!active || event_generation !== initial_generation) return;
                apply_theme_mode(config.theme);
                apply_accent(config.accentColor);
            })
            .catch(() => {
                if (!active || event_generation !== initial_generation) return;
                apply_theme(false);
            });
        return () => {
            active = false;
            unsubscribe_config?.();
            unsubscribe_theme();
        };
    }, []);
}

/** t252: 返回当前全局主题（"dark" | "light"，读 config.theme + 订阅配置/主题事件）。
 *  供代理面板等需要主题值渲染的组件使用，替代独立 usage-theme 存储。 */
export function useGlobalTheme(): "dark" | "light" {
    const [theme, set_theme] = useState<"dark" | "light">("dark");
    useEffect(() => {
        let active = true;
        let event_generation = 0;
        const initial_generation = event_generation;
        const apply_config_theme = (mode: ThemeMode | undefined) => {
            set_theme(resolve_theme_mode(mode) ? "dark" : "light");
        };
        const unsubscribe_config = window.usageboard.event.onConfigChange?.((config) => {
            if (!active) return;
            event_generation += 1;
            apply_config_theme(config.theme);
        });
        const unsubscribe_theme = window.usageboard.event.onThemeChange((dark) => {
            if (!active) return;
            event_generation += 1;
            set_theme(dark ? "dark" : "light");
        });
        void window.usageboard.config
            .get()
            .then(({ config }) => {
                if (!active || event_generation !== initial_generation) return;
                apply_config_theme(config.theme);
            })
            .catch(() => {
                if (!active || event_generation !== initial_generation) return;
                set_theme("dark");
            });
        return () => {
            active = false;
            unsubscribe_config?.();
            unsubscribe_theme();
        };
    }, []);
    return theme;
}
