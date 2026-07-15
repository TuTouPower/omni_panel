import { describe, expect, it } from "vitest";
import {
    bar_fill_color,
    usage_color,
    usage_window_elapsed,
} from "../../../../src/renderer/lib/usage-colors";

describe("usage_color", () => {
    it("returns distinct colors for indices 0-8", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 9; i++) {
            seen.add(usage_color(i));
        }
        expect(seen.size).toBe(9);
        expect(usage_color(8)).toBe("#A7D8D8");
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

    it("all colors are valid hex", () => {
        for (let i = 0; i < 9; i++) {
            expect(usage_color(i)).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
});

describe("usage_window_elapsed", () => {
    it("returns elapsed fraction unchanged", () => {
        expect(usage_window_elapsed(0.6)).toBeCloseTo(0.6);
        expect(usage_window_elapsed(undefined)).toBeUndefined();
        expect(usage_window_elapsed(0)).toBe(0);
        expect(usage_window_elapsed(1)).toBe(1);
    });

    it("lets projected risk colors use elapsed", () => {
        expect(bar_fill_color("risk-projected", { pct: 50, idx: 0, elapsed: 0.6 })).toBe(
            "var(--risk-yellow)",
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
            expect(color).toBe("var(--risk-yellow)");
            expect(joined).toContain("bar fill color raw");
            expect(joined).toContain("risk-projected");
            expect(joined).toContain('"elapsed":0.6');
            expect(joined).toContain('"result":"var(--risk-yellow)"');
        } finally {
            remove_transport();
            setLogLevel("debug");
        }
    });
});
