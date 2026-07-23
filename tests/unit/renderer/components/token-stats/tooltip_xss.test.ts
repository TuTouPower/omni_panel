import { describe, it, expect } from "vitest";
import { build_bar_tooltip_html } from "../../../../../src/renderer/components/token-stats/BarChart";
import { build_donut_tooltip_html } from "../../../../../src/renderer/components/token-stats/MetricDonut";

const fmt = (n: number) => String(n);

describe("build_bar_tooltip_html XSS escaping", () => {
    it("escapes label with <script>", () => {
        const html = build_bar_tooltip_html(
            [{ seriesName: "model-a", value: 10, marker: "", dataIndex: 0 }],
            ["<script>alert(1)</script>"],
            "Token 用量",
            fmt,
            [],
        );
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    it("escapes seriesName with <img onerror>", () => {
        const html = build_bar_tooltip_html(
            [{ seriesName: "<img onerror='a'>", value: 5, marker: "", dataIndex: 0 }],
            ["safe-label"],
            "Token 用量",
            fmt,
            [],
        );
        expect(html).not.toContain("<img onerror");
        expect(html).toContain("&lt;img onerror");
    });

    it("escapes otherDetails key when seriesName is 其他", () => {
        const html = build_bar_tooltip_html(
            [{ seriesName: "其他", value: 5, marker: "", dataIndex: 0 }],
            ["label"],
            "Token 用量",
            fmt,
            [[["<b>evil</b>", 3]]],
        );
        expect(html).not.toContain("<b>evil</b>");
        expect(html).toContain("&lt;b&gt;evil&lt;/b&gt;");
    });
});

describe("build_donut_tooltip_html XSS escaping", () => {
    it("escapes name with <script>", () => {
        const html = build_donut_tooltip_html(
            { name: "<script>x</script>", value: 10, percent: 50 },
            fmt,
        );
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });

    it("escapes name with <img onerror>", () => {
        const html = build_donut_tooltip_html(
            { name: "<img onerror='a'>", value: 1, percent: 5 },
            fmt,
        );
        expect(html).not.toContain("<img onerror");
    });

    it("returns empty for null params", () => {
        expect(build_donut_tooltip_html(null, fmt)).toBe("");
    });
});
