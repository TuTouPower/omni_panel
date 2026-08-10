import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read_source(path: string): string {
    return readFileSync(join(process.cwd(), path), "utf8");
}

describe("first-paint theme background", () => {
    it("passes the native theme in the renderer URL before the page loads", () => {
        const source = read_source("src/main/window/window-manager.ts");

        expect(source).toContain(
            'const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";',
        );
        // URL 构造改为 query 数组拼接（支持 route_query 附加参数），
        // 契约仍是：ou_theme 主题参数 + #route 路由 hash 出现在渲染 URL。
        expect(source).toContain("ou_theme=${theme}");
        expect(source).toContain("#${route}");
    });

    it("keeps settings hidden until the renderer has a first frame", () => {
        const source = read_source("src/main/window/window-manager.ts");

        expect(source).toContain("setting: {");
        expect(source).toContain("show: false,\n        showWhenReady: true,");
        expect(source).toContain('win.once("ready-to-show"');
    });

    it("uses the native Electron background for the pre-document frame", () => {
        const source = read_source("src/main/window/window-manager.ts");

        expect(source).toContain(
            'backgroundColor: nativeTheme.shouldUseDarkColors ? "#181b22" : "#ffffff"',
        );
    });

    it("sets html theme and background synchronously in preload", () => {
        const source = read_source("src/preload/index.ts");

        expect(source).toContain('searchParams.get("ou_theme")');
        expect(source).toContain('document.documentElement.setAttribute("data-theme", theme)');
        expect(source).toContain("document.documentElement.style.backgroundColor");
        expect(source).toContain('theme === "dark" ? "#181b22" : "#ffffff"');
    });

    it("inlines critical html background before JS and bundled CSS load", () => {
        const html = read_source("src/renderer/index.html");

        expect(html).toContain('html[data-theme="dark"]');
        expect(html).toContain("@media (prefers-color-scheme: dark)");
        expect(html.indexOf("<style>")).toBeLessThan(html.indexOf('<script type="module"'));
    });

    it("inlines body/#root background too, so globals.css var(--color-surface-window) (default white) cannot flash through before the bundle loads", () => {
        const html = read_source("src/renderer/index.html");
        // body and #root must be themed inline, not only html.
        expect(html).toContain('html[data-theme="dark"] body');
        expect(html).toContain('html[data-theme="dark"] #root');
        expect(html).toContain("@media (prefers-color-scheme: dark)");
        // color-scheme must be set so Chromium picks the right canvas/scrollbar scheme at first paint.
        expect(html).toContain("color-scheme: dark");
    });

    it("does not animate the first visible window background", () => {
        // t274: `.window` 手写规则已迁到 PopupView window 根的 utility 类，
        // 契约不变：窗口壳背景不参与 transition（仅 height/box-shadow 动画）。
        const source = read_source("src/renderer/views/PopupView.tsx");
        const win_cls_start = source.indexOf('data-popup="live"');
        expect(win_cls_start).toBeGreaterThanOrEqual(0);
        const win_cls = source.slice(0, win_cls_start);
        expect(win_cls).toContain("bg-[var(--color-surface-window)]");
        expect(win_cls).toContain("transition-[height,box-shadow]");
        expect(win_cls).not.toMatch(/transition-\[(?:[^\]]*background|background)/);
        expect(win_cls).not.toMatch(/bg-\[[^\]]*\]\s*transition/);
    });

    it("pre-warms the settings window and hides (not destroys) on close, so reopen reuses the painted window", () => {
        const src = read_source("src/main/index.ts");
        // Pre-warm at startup: the hidden settings window is created + loaded
        // before the user ever opens it, so the first open reveals an
        // already-painted dark window (no fresh-window show-animation flash).
        expect(src).toContain("function ensure_settings_window");
        expect(src).toContain("ensure_settings_window();");
        // Persistence: close hides instead of destroying, so subsequent opens
        // reuse the same loaded window.
        expect(src).toContain("event.preventDefault()");
        expect(src).toContain("settingsWin?.hide()");
    });
});
