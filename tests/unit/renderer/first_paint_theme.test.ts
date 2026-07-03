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
});
