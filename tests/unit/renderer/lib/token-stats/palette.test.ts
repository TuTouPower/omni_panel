import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    agent_color,
    DEFAULT_CHART_PALETTES,
    get_chart_palette_revision,
    notify_chart_palette_change,
    palette_for,
    resolve_chart_palette,
    subscribe_chart_palette_revision,
    top_category_color,
} from "../../../../../src/renderer/lib/echarts_token_resolver";

const root = document.createElement("html");

const css_tokens: Record<string, string> = {
    "--color-surface-card": "#101820",
    "--color-accent": "#123456",
    "--color-usage-1": "#111111",
    "--color-usage-2": "#222222",
    "--color-usage-3": "#333333",
    "--color-usage-4": "#444444",
    "--color-usage-5": "#555555",
    "--color-usage-6": "#666666",
    "--color-usage-7": "#777777",
    "--color-usage-8": "#888888",
    "--color-agent-claude": "#c1c1c1",
    "--color-agent-grok": "#c2c2c2",
    "--color-agent-opencode": "#c3c3c3",
    "--color-agent-kimi": "#c4c4c4",
    "--color-warning": "#ff9900",
    "--color-on-surface-variant": "#909090",
    "--color-outline": "#303030",
    "--color-hairline": "#202020",
    "--color-menu-bg": "#121212",
    "--color-on-surface": "#eeeeee",
    "--color-on-surface-muted": "#707070",
    "--color-surface-raised": "#181818",
    "--font-body-md": "Test Body, sans-serif",
    "--font-code-md": "Test Code, monospace",
};
let active_css_tokens = css_tokens;

beforeEach(() => {
    active_css_tokens = css_tokens;
    vi.spyOn(window, "getComputedStyle").mockImplementation(
        () =>
            ({
                getPropertyValue: (name: string) => active_css_tokens[name] ?? "",
            }) as CSSStyleDeclaration,
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("echarts token resolver", () => {
    it("resolves semantic CSS tokens into concrete ECharts colors", () => {
        const palette = resolve_chart_palette("dark", root);

        expect(palette.accent).toBe("#123456");
        expect(palette.series).toEqual(["#111111", "#222222", "#333333", "#444444", "#555555"]);
        expect(palette.heat).toEqual([
            "#111111",
            "#222222",
            "#333333",
            "#444444",
            "#555555",
            "#666666",
            "#777777",
            "#888888",
        ]);
        expect(palette.agents).toEqual({
            claude: "#c1c1c1",
            grok: "#c2c2c2",
            opencode: "#c3c3c3",
            kimi: "#c4c4c4",
        });
        expect(palette.composition).toEqual({
            cache_read: "#333333",
            input: "#111111",
            cache_write: "#ff9900",
            output: "#222222",
        });
        expect(palette.sliceBorder).toBe("#101820");
        expect(palette.tipBg).toBe("#121212");
        expect(palette.tipText).toBe("#eeeeee");
        expect(palette.font_body).toBe("Test Body, sans-serif");
        expect(palette.font_code).toBe("Test Code, monospace");
        expect(palette.dzSelArea).toBe("rgba(18,52,86,0.2)");
    });

    it("uses theme-specific fallbacks when semantic tokens are unavailable", () => {
        active_css_tokens = {};

        const dark_palette = resolve_chart_palette("dark", root);
        const light_palette = resolve_chart_palette("light", root);
        expect(dark_palette).toEqual(DEFAULT_CHART_PALETTES.dark);
        expect(light_palette).toEqual(DEFAULT_CHART_PALETTES.light);

        for (const palette of [dark_palette, light_palette]) {
            expect(palette.heat).toHaveLength(8);
            for (let index = 1; index < palette.heat.length; index += 1) {
                expect(palette.heat[index]).not.toBe(palette.heat[index - 1]);
            }
        }
    });

    it("increments palette revision and notifies chart subscribers", () => {
        const listener = vi.fn();
        const unsubscribe = subscribe_chart_palette_revision(listener);
        const before = get_chart_palette_revision();

        expect(notify_chart_palette_change()).toBe(before + 1);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it("resolves top-category and agent helpers from the active semantic palette", () => {
        expect(palette_for("dark").series[0]).toBe("#111111");
        expect(top_category_color(1, "dark")).toBe("#222222");
        expect(top_category_color(99, "dark")).toBe("#707070");
        expect(agent_color("claude-code", "dark")).toBe("#c1c1c1");
        expect(agent_color("unknown", "dark")).toBe("#123456");
    });
});
