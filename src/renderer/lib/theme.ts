import { useEffect, useState } from "react";
import { notify_chart_palette_change } from "./echarts_token_resolver";

function apply_theme(is_dark: boolean) {
    const root = document.documentElement;
    const next_theme = is_dark ? "dark" : "light";
    if (root.getAttribute("data-theme") === next_theme) return;
    root.setAttribute("data-theme", next_theme);
    notify_chart_palette_change();
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
    // Apply saved theme + accent immediately on mount so the first frame is correct
    useEffect(() => {
        void window.usageboard.config
            .get()
            .then(({ config }) => {
                const mode = config.theme ?? "system";
                if (mode === "system") {
                    apply_theme(window.matchMedia("(prefers-color-scheme: dark)").matches);
                } else {
                    apply_theme(mode === "dark");
                }
                apply_accent(config.accentColor);
            })
            .catch(() => {
                // default to light
                apply_theme(false);
            });
    }, []);

    // Listen for config changes broadcast by the main process.
    useEffect(() => {
        const unsubscribe = window.usageboard.event.onConfigChange?.((config) => {
            apply_accent(config.accentColor);
        });
        return unsubscribe;
    }, []);

    // Listen for theme changes broadcast by the main process
    useEffect(() => {
        const unsubscribe = window.usageboard.event.onThemeChange((isDark) => {
            apply_theme(isDark);
        });

        return unsubscribe;
    }, []);
}

/** t252: 返回当前全局主题（"dark" | "light"，读 config.theme + 订阅 onThemeChange）。
 *  供代理面板等需要主题值渲染的组件使用，替代独立 usage-theme 存储。 */
export function useGlobalTheme(): "dark" | "light" {
    const [theme, set_theme] = useState<"dark" | "light">("dark");
    useEffect(() => {
        void window.usageboard.config
            .get()
            .then(({ config }) => {
                const mode = config.theme ?? "system";
                const dark =
                    mode === "system"
                        ? window.matchMedia("(prefers-color-scheme: dark)").matches
                        : mode === "dark";
                set_theme(dark ? "dark" : "light");
            })
            .catch(() => {
                set_theme("dark");
            });
        const unsubscribe = window.usageboard.event.onThemeChange((dark) => {
            set_theme(dark ? "dark" : "light");
        });
        return unsubscribe;
    }, []);
    return theme;
}
