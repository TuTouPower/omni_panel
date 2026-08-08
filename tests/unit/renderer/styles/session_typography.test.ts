import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * t265 AC1：会话标题与元信息字号层级断言（CSS 文本断言，非 jsdom computed style）。
 * t257 字号互换：标题小字号、元信息大字号。会话库（rail）与面板（pane）两处覆盖。
 */
describe("会话字号层级视觉断言 (t265)", () => {
    it("会话面板 pane-title 11px（小）< pane-meta 13px（大）(t257 互换)", () => {
        const css = readFileSync(join(process.cwd(), "src/renderer/styles/pane.css"), "utf8");
        const title = /\.pane-title\s*\{[^}]*\}/s.exec(css)?.[0];
        const meta = /\.pane-meta\s*\{[^}]*\}/s.exec(css)?.[0];
        expect(title).toBeDefined();
        expect(meta).toBeDefined();
        expect(title).toMatch(/font-size:\s*11px/);
        expect(meta).toMatch(/font-size:\s*13px/);
        // 标题字号严格小于元信息字号（互换后语义）。
        const title_size = Number(title?.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
        const meta_size = Number(meta?.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
        expect(title_size).toBeLessThan(meta_size);
    });

    it("会话库 rail-title 12.5px（大）> rail-sub 11px（小）", () => {
        const css = readFileSync(
            join(process.cwd(), "src/renderer/styles/workspace/workspace-rail.css"),
            "utf8",
        );
        const title = /\.rail-title\s*\{[^}]*\}/s.exec(css)?.[0];
        const sub = /\.rail-sub\s*\{[^}]*\}/s.exec(css)?.[0];
        expect(title).toBeDefined();
        expect(sub).toBeDefined();
        expect(title).toMatch(/font-size:\s*12\.5px/);
        expect(sub).toMatch(/font-size:\s*11px/);
        const title_size = Number(title?.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
        const sub_size = Number(sub?.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
        expect(title_size).toBeGreaterThan(sub_size);
    });

    it("组件挂载类名与 CSS 规则映射一致：SessionPane 用 pane-title/pane-meta，SessionRail 用 rail-title/rail-sub", () => {
        const pane = readFileSync(
            join(process.cwd(), "src/renderer/components/workspace/SessionPane.tsx"),
            "utf8",
        );
        const rail = readFileSync(
            join(process.cwd(), "src/renderer/components/workspace/SessionRail.tsx"),
            "utf8",
        );
        expect(pane).toMatch(/className="pane-title"/);
        expect(pane).toMatch(/className="pane-meta"/);
        expect(rail).toMatch(/className="rail-title"/);
        expect(rail).toMatch(/className="rail-sub"/);
    });
});
