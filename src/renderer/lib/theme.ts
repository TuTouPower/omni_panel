import { useEffect, useState } from "react";

function apply_theme(is_dark: boolean) {
    document.documentElement.setAttribute("data-theme", is_dark ? "dark" : "light");
}

export function useTheme() {
    // Apply saved theme immediately on mount so the first frame is correct
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
            })
            .catch(() => {
                // default to light
                apply_theme(false);
            });
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
