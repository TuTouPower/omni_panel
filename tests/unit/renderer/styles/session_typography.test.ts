import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * t265 AC1：会话标题与元信息字号层级断言。
 * t273 迁移后由组件 utility 与全局语义字号 token 承载，不再读取独立 pane/rail CSS。
 */
describe("会话字号层级视觉断言 (t265)", () => {
    it("会话面板标题 11px（小）< 元信息 13px（大）(t257 互换)", () => {
        const pane = readFileSync(
            join(process.cwd(), "src/renderer/components/workspace/SessionPane.tsx"),
            "utf8",
        );
        const title = /conversation-title[^\"]*text-\[11px\]/s.exec(pane)?.[0];
        const meta = /conversation-meta[^\"]*text-\[13px\]/s.exec(pane)?.[0];
        expect(title).toBeDefined();
        expect(meta).toBeDefined();
    });

    it("会话 rail 标题使用 body-sm，元信息使用 label-md", () => {
        const rail = readFileSync(
            join(process.cwd(), "src/renderer/components/workspace/SessionRail.tsx"),
            "utf8",
        );
        expect(rail).toMatch(/history-slot-title[^\"]*text-body-sm/);
        expect(rail).toMatch(/history-slot-meta[^\"]*text-label-md/);
    });

    it("字号 utility 映射到全局语义 token", () => {
        const css = readFileSync(join(process.cwd(), "src/renderer/styles/globals.css"), "utf8");
        expect(css).toMatch(/--text-body-sm:\s*12\.5px/);
        expect(css).toMatch(/--text-label-md:\s*11\.5px/);
    });
});
