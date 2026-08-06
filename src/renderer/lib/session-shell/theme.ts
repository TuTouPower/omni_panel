import { useCallback, useLayoutEffect, useState } from "react";

export const SESSION_THEME_KEY = "omni_session_theme";

type ShellTheme = "dark" | "light";

function read_theme(): ShellTheme {
    try {
        return localStorage.getItem(SESSION_THEME_KEY) === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

/** 会话窗口独立主题：不写全局 config.theme，只作用于会话窗口文档（t223）。 */
export function useSessionShellTheme() {
    const [theme, set_theme] = useState<ShellTheme>(read_theme);

    // useLayoutEffect：在浏览器绘制前同步应用持久化主题，避免 preload 首帧按
    // 系统 ou_theme 写 data-theme 后、effect 阶段才被持久化主题覆盖导致闪一帧。
    useLayoutEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem(SESSION_THEME_KEY, theme);
        } catch {
            // 忽略持久化失败；主题仍在本窗口生效。
        }
    }, [theme]);

    const toggle_theme = useCallback(() => {
        set_theme((prev) => (prev === "dark" ? "light" : "dark"));
    }, []);

    return { theme, toggle_theme };
}
