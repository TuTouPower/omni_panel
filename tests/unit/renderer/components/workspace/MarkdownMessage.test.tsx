import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "../../../../../src/renderer/components/workspace/MarkdownMessage";

/**
 * t225 消息 Markdown 渲染测试。
 * 覆盖：标题/粗斜体/列表/表格/行内码/代码块/GFM 任务列表；原始 HTML 不执行（安全约束）。
 */

describe("MarkdownMessage (t225)", () => {
    it("渲染标题与粗斜体", () => {
        render(<MarkdownMessage text="# 标题\n\n**粗体** 和 *斜体*" />);
        expect(document.querySelector("h1")).toBeTruthy();
        expect(document.querySelector("strong")?.textContent).toBe("粗体");
        expect(document.querySelector("em")?.textContent).toBe("斜体");
    });

    it("渲染列表与 GFM 表格", () => {
        render(<MarkdownMessage text={"- 甲\n- 乙\n\n| A | B |\n|---|---|\n| 1 | 2 |"} />);
        expect(document.querySelectorAll("li").length).toBe(2);
        expect(document.querySelector("table")).toBeTruthy();
        expect(document.querySelectorAll("th").length).toBe(2);
    });

    it("渲染行内代码与代码块", () => {
        render(<MarkdownMessage text={"用 `code` 标识\n\n```ts\nconst x = 1;\n```"} />);
        expect(document.querySelectorAll("code").length).toBeGreaterThan(0);
        expect(document.querySelector("pre code")).toBeTruthy();
    });

    it("GFM 任务列表渲染 checkbox", () => {
        render(<MarkdownMessage text={"- [x] 完成\n- [ ] 待办"} />);
        expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(2);
        expect(document.querySelectorAll('input[type="checkbox"][checked]').length).toBe(1);
    });

    it("原始 HTML 不按 HTML 执行（安全）", () => {
        render(
            <MarkdownMessage
                text={
                    '<script>window.__xss = 1</script>\n<img src="x" onerror="window.__xss2=1" />\n<p>你好</p>'
                }
            />,
        );
        expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
        expect((window as unknown as { __xss2?: number }).__xss2).toBeUndefined();
        // 不渲染为可执行的 HTML 元素（无 img/无真实 p 标签），按文本或安全转义呈现。
        expect(document.querySelector("img")).toBeNull();
        expect(document.querySelector("script")).toBeNull();
    });

    it("空文本渲染为空", () => {
        const { container } = render(<MarkdownMessage text="" />);
        expect(container.textContent).toBe("");
    });
});
