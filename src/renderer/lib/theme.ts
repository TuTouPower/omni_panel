import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify_chart_palette_change } from "./echarts_token_resolver";

export function apply_theme(is_dark: boolean): void {
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
 * t418: 本表为 accent 预设 hex 的唯一代码侧来源；UI 须从此导出，不得另写副本。
 */
const ACCENT_PRESET_LIST = [
    { hex: "#3d7afd", key: "blue" },
    { hex: "#6f5cf6", key: "purple" },
    { hex: "#0ea5a3", key: "teal" },
    { hex: "#f5772f", key: "orange" },
    { hex: "#e23744", key: "red" },
] as const;

export const ACCENT_PRESETS: Readonly<Record<string, string>> = Object.fromEntries(
    ACCENT_PRESET_LIST.map((p) => [p.hex, p.key]),
);

/** 五档预设 hex 有序列表（= UI swatch 顺序）。 */
export const ACCENT_PRESET_COLORS: readonly string[] = ACCENT_PRESET_LIST.map((p) => p.hex);

/** 默认强调色 = 映射表第一档（blue）。 */
export const DEFAULT_ACCENT_COLOR: string = ACCENT_PRESET_LIST[0].hex;

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

/**
 * t360: useTheme/useGlobalTheme 共享的主题订阅样板——onConfigChange + onThemeChange
 * 订阅、event_generation 守卫（push 事件先于初始 snapshot 时丢弃 stale snapshot）。
 * 返回 `is_current(generation)` 判定回调是否仍应生效。
 */
/* eslint-disable react-hooks/rules-of-hooks -- snake_case hook 内部调用不被 v7 识别 */
function use_theme_events(): {
    is_current: (expected: number) => boolean;
    mark_config: () => void;
    mark_theme: () => void;
} {
    const state_ref = useRef({ active: true, generation: 0 });
    const is_current = useCallback(
        (expected: number) => state_ref.current.active && state_ref.current.generation === expected,
        [],
    );
    const mark_config = useCallback(() => {
        state_ref.current.generation += 1;
    }, []);
    const mark_theme = useCallback(() => {
        state_ref.current.generation += 1;
    }, []);
    useEffect(() => {
        const state = state_ref.current;
        return () => {
            state.active = false;
        };
    }, []);
    // 引用稳定，避免 useEffect 依赖变化导致反复重订阅。
    return useMemo(
        () => ({ is_current, mark_config, mark_theme }),
        [is_current, mark_config, mark_theme],
    );
}
/* eslint-enable react-hooks/rules-of-hooks */

export function useTheme() {
    const events = use_theme_events();
    // Subscribe before reading the initial snapshot. A push event received first
    // makes the in-flight snapshot stale and prevents it from rolling the theme back.
    useEffect(() => {
        const initial_generation = 0;
        const unsubscribe_config = window.usageboard.event.onConfigChange?.((config) => {
            events.mark_config();
            apply_theme_mode(config.theme);
            apply_accent(config.accentColor);
        });
        const unsubscribe_theme = window.usageboard.event.onThemeChange((isDark) => {
            events.mark_theme();
            apply_theme(isDark);
        });
        void window.usageboard.config
            .get()
            .then(({ config }) => {
                if (!events.is_current(initial_generation)) return;
                apply_theme_mode(config.theme);
                apply_accent(config.accentColor);
            })
            .catch(() => {
                if (!events.is_current(initial_generation)) return;
                apply_theme(false);
            });
        return () => {
            unsubscribe_config?.();
            unsubscribe_theme();
        };
    }, [events]);
}

/** t252: 返回当前全局主题（"dark" | "light"，读 config.theme + 订阅配置/主题事件）。
 *  供代理面板等需要主题值渲染的组件使用，替代独立 usage-theme 存储。 */
export function useGlobalTheme(): "dark" | "light" {
    const [theme, set_theme] = useState<"dark" | "light">("dark");
    const events = use_theme_events();
    useEffect(() => {
        const initial_generation = 0;
        const apply_config_theme = (mode: ThemeMode | undefined) => {
            set_theme(resolve_theme_mode(mode) ? "dark" : "light");
        };
        const unsubscribe_config = window.usageboard.event.onConfigChange?.((config) => {
            events.mark_config();
            apply_config_theme(config.theme);
        });
        const unsubscribe_theme = window.usageboard.event.onThemeChange((dark) => {
            events.mark_theme();
            set_theme(dark ? "dark" : "light");
        });
        void window.usageboard.config
            .get()
            .then(({ config }) => {
                if (!events.is_current(initial_generation)) return;
                apply_config_theme(config.theme);
            })
            .catch(() => {
                if (!events.is_current(initial_generation)) return;
                set_theme("dark");
            });
        return () => {
            unsubscribe_config?.();
            unsubscribe_theme();
        };
    }, [events]);
    return theme;
}
