import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGlobalTheme, useTheme } from "../../../../src/renderer/lib/theme";

/**
 * t252 AC6：代理面板主题跟随全局（弃用独立 usage-theme 存储）。
 * - useGlobalTheme 读 config.theme 返回 "dark"|"light"，并随 onThemeChange 更新。
 * - useTheme 同步 documentElement[data-theme]，使 CSS 明暗实时跟随。
 */

describe("theme hooks (t252 AC6)", () => {
    let theme_cb: ((is_dark: boolean) => void) | undefined;

    function install(config_theme: "light" | "dark" | "system") {
        theme_cb = undefined;
        (window as unknown as { usageboard: unknown }).usageboard = {
            config: {
                get: vi.fn().mockResolvedValue({ config: { theme: config_theme }, hasSecrets: {} }),
            },
            event: {
                onThemeChange: vi.fn((cb: (is_dark: boolean) => void) => {
                    theme_cb = cb;
                    return vi.fn();
                }),
            },
            log: vi.fn(),
        };
    }

    beforeEach(() => {
        document.documentElement.removeAttribute("data-theme");
    });

    it("useGlobalTheme 读 config.theme 返回主题值", async () => {
        install("light");
        const { result } = renderHook(() => useGlobalTheme());
        await waitFor(() => {
            expect(result.current).toBe("light");
        });
    });

    it("useGlobalTheme 随 onThemeChange 更新主题值", async () => {
        install("light");
        const { result } = renderHook(() => useGlobalTheme());
        await waitFor(() => {
            expect(result.current).toBe("light");
        });
        act(() => {
            theme_cb?.(true);
        });
        expect(result.current).toBe("dark");
    });

    it("useTheme 同步 data-theme 并随 onThemeChange 更新", async () => {
        install("dark");
        renderHook(() => {
            useTheme();
        });
        await waitFor(() => {
            expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        });
        act(() => {
            theme_cb?.(false);
        });
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("config.theme=system 时按 prefers-color-scheme 解析", async () => {
        install("system");
        const matchMedia = window.matchMedia;
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            writable: true,
            value: vi.fn().mockReturnValue({ matches: true }),
        });
        const { result } = renderHook(() => useGlobalTheme());
        await waitFor(() => {
            expect(result.current).toBe("dark");
        });
        window.matchMedia = matchMedia;
    });
});
