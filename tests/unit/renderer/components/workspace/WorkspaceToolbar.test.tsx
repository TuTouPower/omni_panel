import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceToolbar } from "../../../../../src/renderer/components/workspace/WorkspaceToolbar";

/**
 * t318 AC1/AC2：工具栏占满与纵向紧凑。沿用 session_typography 的 DOM class 断言方式——
 * 元素必须真实渲染且带对应布局类。语义等价：actions 占满可用宽并靠右对齐（flex-1 +
 * justify-end，消除控制组右侧大段留白）；工具栏纵向 padding 收紧（py-1.5，原 py-2）。
 */

function render_toolbar() {
    return render(
        <WorkspaceToolbar
            layout={3}
            count={0}
            view={{ show_time: false, compact: false }}
            on_view_change={() => undefined}
            on_layout_change={() => undefined}
            on_recent={() => undefined}
            on_clear={() => undefined}
        />,
    );
}

describe("WorkspaceToolbar (t318 占满与纵向紧凑)", () => {
    it("AC1：工具栏与 actions 占满可用宽度，actions 靠右对齐（flex-1 + justify-end）", () => {
        render_toolbar();
        const toolbar = document.querySelector(".session-toolbar");
        const actions = document.querySelector(".session-toolbar-actions");
        expect(toolbar).toBeTruthy();
        expect(actions).toBeTruthy();
        expect(toolbar?.className).toContain("flex-1");
        expect(actions?.className).toContain("flex-1");
        expect(actions?.className).toContain("justify-end");
    });

    it("AC2：工具栏纵向留白收紧为 py-1.5，不再使用 py-2", () => {
        render_toolbar();
        const toolbar = document.querySelector(".session-toolbar");
        expect(toolbar?.className).toContain("py-1.5");
        expect(toolbar?.className).not.toContain("py-2");
    });
});
