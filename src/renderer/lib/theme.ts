import { useEffect } from "react";

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
