import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "../../../../../src/renderer/components/workspace/MarkdownMessage";

/** t237 MarkdownMessage memo 化测试：text 不变时父级重渲染不触发重解析。 */

describe("MarkdownMessage memo (t237)", () => {
    it("父组件重渲染时，相同 text 的 MarkdownMessage 不重渲染", () => {
        let count = 0;
        const onRender = (): void => {
            count += 1;
        };

        function Parent() {
            const [, setTick] = useState(0);
            return (
                <div>
                    <button
                        type="button"
                        onClick={() => {
                            setTick((t) => t + 1);
                        }}
                    >
                        tick
                    </button>
                    <MarkdownMessage text="# 标题\n- 甲" onRender={onRender} />
                </div>
            );
        }

        const { getByText } = render(<Parent />);
        expect(count).toBe(1);

        fireEvent.click(getByText("tick"));
        fireEvent.click(getByText("tick"));
        expect(count).toBe(1);
    });
});

describe("MarkdownMessage link scheme allowlist (t297)", () => {
    it("renders http link as an anchor with noopener noreferrer", () => {
        const { container } = render(<MarkdownMessage text="[site](http://example.com)" />);
        const anchor = container.querySelector("a");
        expect(anchor).not.toBeNull();
        expect(anchor?.getAttribute("href")).toBe("http://example.com");
        expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
        expect(anchor?.getAttribute("target")).toBe("_blank");
    });

    it("renders https link as an anchor with noopener noreferrer", () => {
        const { container } = render(<MarkdownMessage text="[docs](https://example.com/page)" />);
        const anchor = container.querySelector("a");
        expect(anchor).not.toBeNull();
        expect(anchor?.getAttribute("href")).toBe("https://example.com/page");
        expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer");
        expect(anchor?.getAttribute("target")).toBe("_blank");
    });

    it("renders javascript: link as plain text (no anchor)", () => {
        const { container } = render(<MarkdownMessage text="[click](javascript:alert(1))" />);
        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toContain("click");
    });

    it("renders file: link as plain text (no anchor)", () => {
        const { container } = render(<MarkdownMessage text="[local](file:///etc/passwd)" />);
        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toContain("local");
    });

    it("renders unknown scheme link as plain text (no anchor)", () => {
        const { container } = render(<MarkdownMessage text="[app](custom-scheme://x)" />);
        expect(container.querySelector("a")).toBeNull();
        expect(container.textContent).toContain("app");
    });
});
