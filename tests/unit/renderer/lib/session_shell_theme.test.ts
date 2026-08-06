import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
    SESSION_THEME_KEY,
    useSessionShellTheme,
} from "../../../../src/renderer/lib/session-shell/theme";

const THEME_KEY = SESSION_THEME_KEY;

beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
});

describe("useSessionShellTheme (t223)", () => {
    it("全新默认暗色：无持久化值时 theme=dark，data-theme=dark，写入 localStorage", () => {
        const { result } = renderHook(() => useSessionShellTheme());
        expect(result.current.theme).toBe("dark");
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    });

    it("预存 light 时初始 light", () => {
        localStorage.setItem(THEME_KEY, "light");
        const { result } = renderHook(() => useSessionShellTheme());
        expect(result.current.theme).toBe("light");
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("toggle 在明暗间切换并同步 localStorage 与 html 属性", () => {
        const { result } = renderHook(() => useSessionShellTheme());
        act(() => {
            result.current.toggle_theme();
        });
        expect(result.current.theme).toBe("light");
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
        expect(localStorage.getItem(THEME_KEY)).toBe("light");

        act(() => {
            result.current.toggle_theme();
        });
        expect(result.current.theme).toBe("dark");
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
        expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    });
});
