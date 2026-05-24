import { useEffect } from "react";

export function useTheme() {
    useEffect(() => {
        const unsubscribe = window.usageboard.event.onThemeChange((isDark) => {
            document.documentElement.classList.toggle("dark", isDark);
        });

        return unsubscribe;
    }, []);
}
