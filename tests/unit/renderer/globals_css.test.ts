import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");

describe("globals usage bar css", () => {
    it("keeps one centered bar percentage rule", () => {
        expect(css.match(/\.bar-pct\s*\{/g)).toHaveLength(1);
        expect(css).toMatch(/\.bar-pct\s*\{[\s\S]*text-align:\s*center;/);
    });

    it("uses the usage-bar track token", () => {
        expect(css).toContain("--bar-track: #e9edf5");
        expect(css).toContain("--bar-track: #2b313c");
        expect(css).toContain("background: var(--bar-track)");
    });

    it("keeps ratio rows aligned to the compact value column", () => {
        expect(css).toMatch(
            /\.bar-row\.frac\s*\{\s*grid-template-columns:\s*42px 1fr 64px 76px;\s*\}/,
        );
    });

    it("does not keep obsolete bar classes", () => {
        expect(css).not.toMatch(/\.fill\.(blue|purple|danger)/);
        expect(css).not.toContain(".bar-pct.danger");
        expect(css).not.toContain(".app-badge");
        expect(css).not.toContain(".aa-badge");
        expect(css).not.toContain(".tray-win-tag");
    });
});
