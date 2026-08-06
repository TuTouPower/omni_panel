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
