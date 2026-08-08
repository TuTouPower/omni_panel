import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGlobalTheme, useTheme, apply_accent } from "../../../../src/renderer/lib/theme";

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

describe("apply_accent（t268）", () => {
    afterEach(() => {
        document.documentElement.style.removeProperty("--accent");
    });

    it("预设 hex → 对应 accent key（blue）", () => {
        apply_accent("#3d7afd");
        expect(document.documentElement.style.getPropertyValue("--accent")).toContain(
            "--accent-blue",
        );
    });

    it("预设 hex → 对应 accent key（red）", () => {
        apply_accent("#e23744");
        expect(document.documentElement.style.getPropertyValue("--accent")).toContain(
            "--accent-red",
        );
    });

    it("自定义 hex → 直接作为 base 色", () => {
        apply_accent("#ff8800");
        expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#ff8800");
    });

    it("非法 hex → 回落 blue", () => {
        apply_accent("not-a-color");
        expect(document.documentElement.style.getPropertyValue("--accent")).toContain(
            "--accent-blue",
        );
    });

    it("缺失 → 回落 blue", () => {
        apply_accent(undefined);
        expect(document.documentElement.style.getPropertyValue("--accent")).toContain(
            "--accent-blue",
        );
    });

    it("五档 accent × light/dark 矩阵：--accent 正确切换（AC3）", () => {
        // light 下五档预设 → 对应 accent key
        document.documentElement.setAttribute("data-theme", "light");
        const cases: [string, string][] = [
            ["#3d7afd", "--accent-blue"],
            ["#6f5cf6", "--accent-purple"],
            ["#0ea5a3", "--accent-teal"],
            ["#f5772f", "--accent-orange"],
            ["#e23744", "--accent-red"],
        ];
        for (const [hex, key] of cases) {
            apply_accent(hex);
            expect(document.documentElement.style.getPropertyValue("--accent")).toContain(key);
        }
        // dark 下预设 → 对应 dark accent key（apply_accent 用 var(--accent-key)，
        // dark 值由 .dark 块 --accent-key 覆盖，此处断言变量引用不变）
        document.documentElement.setAttribute("data-theme", "dark");
        apply_accent("#3d7afd");
        expect(document.documentElement.style.getPropertyValue("--accent")).toContain(
            "--accent-blue",
        );
        document.documentElement.setAttribute("data-theme", "light");
    });
});
