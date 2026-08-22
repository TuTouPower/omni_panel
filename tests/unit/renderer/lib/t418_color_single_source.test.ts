import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    ACCENT_PRESET_COLORS,
    ACCENT_PRESETS,
    DEFAULT_ACCENT_COLOR,
} from "../../../../src/renderer/lib/theme";

function read_source(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("t418 accent preset single source (AC-002)", () => {
    it("exports five ordered preset hexes from theme mapping table", () => {
        expect(ACCENT_PRESET_COLORS).toHaveLength(5);
        expect(DEFAULT_ACCENT_COLOR).toBe(ACCENT_PRESET_COLORS[0]);
        expect(ACCENT_PRESETS[DEFAULT_ACCENT_COLOR]).toBe("blue");
        for (const hex of ACCENT_PRESET_COLORS) {
            expect(hex).toMatch(/^#[0-9a-f]{6}$/);
            expect(ACCENT_PRESETS[hex]).toBeDefined();
        }
    });

    it("appearance_section.tsx holds no accent hex copy", () => {
        const src = read_source("src/renderer/views/settings-view/sections/appearance_section.tsx");
        // 旧 ACCENTS 字面量与兜底 hex 不得再现。
        for (const hex of ACCENT_PRESET_COLORS) {
            expect(src).not.toContain(`"${hex}"`);
            expect(src).not.toContain(`'${hex}'`);
        }
        expect(src).toContain("ACCENT_PRESET_COLORS");
        expect(src).toContain("DEFAULT_ACCENT_COLOR");
    });
});

describe("t418 about page tint token source (AC-003)", () => {
    it("about_section.tsx has no bare hex tint", () => {
        const src = read_source("src/renderer/views/settings-view/sections/about_section.tsx");
        // 旧 8 处 tint 裸 hex 不得再现。
        for (const hex of ["#3d7afd", "#6f5cf6", "#0ea5a3", "#e23744", "#fff"]) {
            expect(src).not.toContain(hex);
        }
        expect(src).toContain("var(--color-accent-blue)");
        expect(src).toContain("var(--color-accent-purple)");
        expect(src).toContain("var(--color-accent-teal)");
        expect(src).toContain("var(--color-accent-red)");
        expect(src).toContain("var(--color-on-primary)");
    });
});
