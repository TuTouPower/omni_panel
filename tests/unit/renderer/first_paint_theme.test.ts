import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read_source(path: string): string {
    return readFileSync(join(process.cwd(), path), "utf8");
}

describe("first-paint theme background", () => {
    it("passes the native theme in the renderer URL before the page loads", () => {
        const source = read_source("src/main/index.ts");

        expect(source).toContain(
            'const theme = nativeTheme.shouldUseDarkColors ? "dark" : "light";',
        );
        expect(source).toContain("?ou_theme=${theme}#${route}");
    });

    it("keeps settings hidden until the renderer has a first frame", () => {
        const source = read_source("src/main/index.ts");

        expect(source).toContain("settings: {");
        expect(source).toContain("show: false,\n        showWhenReady: true,");
        expect(source).toContain('win.once("ready-to-show"');
    });

    it("uses the native Electron background for the pre-document frame", () => {
        const source = read_source("src/main/index.ts");

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

    it("inlines body/#root background too, so globals.css var(--win-bg) (default white) cannot flash through before the bundle loads", () => {
        const html = read_source("src/renderer/index.html");
        // body and #root must be themed inline, not only html.
        expect(html).toContain('html[data-theme="dark"] body');
        expect(html).toContain('html[data-theme="dark"] #root');
        expect(html).toContain("@media (prefers-color-scheme: dark)");
        // color-scheme must be set so Chromium picks the right canvas/scrollbar scheme at first paint.
        expect(html).toContain("color-scheme: dark");
    });

    it("does not animate the first visible window background", () => {
        const css = read_source("src/renderer/styles/globals.css");
        const window_start = css.indexOf(".window {");
        const window_end = css.indexOf("}\n@media", window_start);
        const window_rule = css.slice(window_start, window_end);

        expect(window_start).toBeGreaterThanOrEqual(0);
        expect(window_end).toBeGreaterThan(window_start);
        expect(window_rule).toContain("background: var(--win-bg)");
        expect(window_rule).not.toContain("background 0.35s ease");
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
