import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    USAGE_COLOR_TOKENS,
    bar_fill_color,
    usage_color,
} from "../../../../src/renderer/lib/usage-colors";
import { BAR_COLOR_SCHEMES } from "../../../../src/renderer/views/settings-view/lib";

describe("usage_color (t418 token single source)", () => {
    it("returns distinct CSS var tokens for indices 0-8", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 9; i++) {
            seen.add(usage_color(i));
        }
        expect(seen.size).toBe(9);
        expect(usage_color(0)).toBe("var(--color-usage-1)");
        expect(usage_color(8)).toBe("var(--color-usage-9)");
    });

    it("cycles every 9 indices", () => {
        for (let i = 0; i < 9; i++) {
            expect(usage_color(i + 9)).toBe(usage_color(i));
            expect(usage_color(i + 18)).toBe(usage_color(i));
        }
    });

    it("handles negative indices", () => {
        expect(usage_color(-1)).toBe(usage_color(8));
        expect(usage_color(-9)).toBe(usage_color(0));
        expect(usage_color(-10)).toBe(usage_color(8));
    });

    it("all colors are CSS var(--color-usage-N) tokens", () => {
        for (let i = 0; i < 9; i++) {
            expect(usage_color(i)).toMatch(/^var\(--color-usage-[1-9]\)$/);
        }
    });

    it("USAGE_COLOR_TOKENS is the sole runtime nine-cycle palette", () => {
        expect(USAGE_COLOR_TOKENS).toHaveLength(9);
        for (let i = 0; i < 9; i++) {
            expect(usage_color(i)).toBe(USAGE_COLOR_TOKENS[i]);
        }
    });

    it("nine-cycle bar fill uses token vars", () => {
        expect(bar_fill_color("nine-cycle", { pct: 50, idx: 0 })).toBe("var(--color-usage-1)");
        expect(bar_fill_color("nine-cycle", { pct: 99, idx: 3 })).toBe("var(--color-usage-4)");
    });
});

describe("nine-cycle swatch linkage (t418 AC-001)", () => {
    it("settings nine-cycle swatch reuses USAGE_COLOR_TOKENS", () => {
        const scheme = BAR_COLOR_SCHEMES.find((s) => s.value === "nine-cycle");
        expect(scheme).toBeDefined();
        if (!scheme) throw new Error("nine-cycle scheme missing");
        expect(scheme.swatch).toEqual([...USAGE_COLOR_TOKENS.slice(0, 5)]);
        for (const color of scheme.swatch) {
            expect(color).toMatch(/^var\(--color-usage-[1-9]\)$/);
            expect(color).not.toMatch(/^#[0-9a-fA-F]{3,8}$/);
        }
    });

    it("usage-colors.ts and settings swatch hold no bare nine-cycle hex", () => {
        const usage_src = readFileSync(
            join(process.cwd(), "src/renderer/lib/usage-colors.ts"),
            "utf8",
        );
        const lib_src = readFileSync(
            join(process.cwd(), "src/renderer/views/settings-view/lib.ts"),
            "utf8",
        );
        // 任意 6 位 hex 字面量均视为双源回归（九色全量 + 变体）。
        expect(usage_src).not.toMatch(/#[0-9a-fA-F]{6}/);
        expect(lib_src).not.toMatch(/#[0-9a-fA-F]{6}/);
        expect(usage_src).toContain("var(--color-usage-1)");
        expect(lib_src).toContain("USAGE_COLOR_TOKENS");
    });
});

describe("projected risk color", () => {
    it("lets projected risk colors use elapsed", () => {
        expect(bar_fill_color("risk-projected", { pct: 50, idx: 0, elapsed: 0.6 })).toBe(
            "var(--color-risk-mid)",
        );
    });
});

describe("usage color debug logs", () => {
    it("logs bar fill color decisions", async () => {
        const { addTransport, setLogLevel } = await import("../../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const color = bar_fill_color("risk-projected", { pct: 50, idx: 0, elapsed: 0.6 });

            const joined = lines.join("\n");
            expect(color).toBe("var(--color-risk-mid)");
            expect(joined).toContain("bar fill color raw");
            expect(joined).toContain("risk-projected");
            expect(joined).toContain('"elapsed":0.6');
            expect(joined).toContain('"result":"var(--color-risk-mid)"');
        } finally {
            remove_transport();
            setLogLevel("debug");
        }
    });
});
