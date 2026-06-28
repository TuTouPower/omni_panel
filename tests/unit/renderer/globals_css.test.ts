import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");

describe("globals usage bar css", () => {
    it("keeps right-aligned tabular bar value columns", () => {
        expect(css).toMatch(
            /\.bar-pct,\s*\.bar-reset,\s*\.bar-clock\s*\{[\s\S]*text-align:\s*right;/,
        );
        expect(css).toMatch(
            /\.bar-pct,\s*\.bar-reset,\s*\.bar-clock\s*\{[\s\S]*font-variant-numeric:\s*tabular-nums;/,
        );
    });

    it("uses the usage-bar track token", () => {
        expect(css).toContain("--bar-track: #e9edf5");
        expect(css).toContain("--bar-track: #2b313c");
        expect(css).toContain("background: var(--bar-track)");
    });

    it("keeps ratio rows aligned to the five-column layout", () => {
        expect(css).toMatch(
            /\.bar-row\.frac\s*\{\s*grid-template-columns:\s*4ic minmax\(0, 1fr\) 5ch 5ch 5ch;\s*\}/,
        );
    });

    it("keeps capsule bars aligned and isolated", () => {
        expect(css).toContain(".bar-row.capsule");
        expect(css).toContain("grid-template-columns: 4ic minmax(0, 1fr) 5ch 5ch");
        expect(css).toContain("height: 22px");
        expect(css).toContain("background: color-mix(in srgb, var(--bar-fill) 16%, transparent)");
        expect(css).toContain("border-radius: 999px");
        expect(css).toContain("isolation: isolate");
        expect(css).toContain(".bar-capsule-value-dark");
        expect(css).toContain(".bar-capsule-value-light");
    });

    it("keeps main panel scrollable without showing a right-side scrollbar", () => {
        const main_scroll_css = /\.scroll\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? "";

        expect(main_scroll_css).toContain("overflow-y: auto");
        expect(main_scroll_css).toContain("scrollbar-width: none");
        expect(main_scroll_css).toContain("-ms-overflow-style: none");
        expect(css).toMatch(/\.scroll::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
    });

    it("does not keep obsolete bar classes", () => {
        expect(css).not.toMatch(/\.fill\.(blue|purple|danger)/);
        expect(css).not.toContain(".bar-pct.danger");
        expect(css).not.toContain(".app-badge");
        expect(css).not.toContain(".aa-badge");
        expect(css).not.toContain(".tray-win-tag");
        expect(css).not.toContain(".off-badge");
        expect(css).not.toContain(".card.disabled");
    });
});
