import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceToolbar } from "../../../../../src/renderer/components/workspace/WorkspaceToolbar";
import type { ComponentProps } from "react";

/**
 * t323：工作台三按钮上移顶栏（内联渲染于 PanelTitleBar before_actions）。
 * 覆盖：按钮顺序 最近会话 → 清空 → 视图；视图下拉含显示时间戳/紧凑模式，
 * count>0 时提供会话排布选项（t318 原「占满整行/纵向紧凑」语义随上移作废）。
 */

function render_toolbar(overrides: Partial<ComponentProps<typeof WorkspaceToolbar>> = {}) {
    return render(
        <WorkspaceToolbar
            layout={3}
            count={0}
            view={{ show_time: false, compact: false }}
            on_view_change={() => undefined}
            on_layout_change={() => undefined}
            on_recent={() => undefined}
            on_clear={() => undefined}
            {...overrides}
        />,
    );
}

function before(a: HTMLElement, b: HTMLElement): boolean {
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("WorkspaceToolbar (t323 顶栏内联)", () => {
    it("AC-001：按钮顺序为 最近会话 → 清空 → 视图", () => {
        render_toolbar();
        const recent = screen.getByRole("button", { name: "最近会话" });
        const clear = screen.getByRole("button", { name: "清空" });
        const view = screen.getByRole("button", { name: /视图/ });
        expect(before(recent, clear)).toBe(true);
        expect(before(clear, view)).toBe(true);
    });

    it("AC-002：视图下拉含显示时间戳/紧凑模式，count>0 时含会话排布", () => {
        render_toolbar({ count: 3, layout: 3 });
        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        expect(screen.getByLabelText("显示时间戳")).toBeTruthy();
        expect(screen.getByLabelText("紧凑模式")).toBeTruthy();
        // 3 个会话 → 3 列 × 1 行。
        expect(screen.getByRole("button", { name: "3 列 × 1 行" })).toBeTruthy();
        // 当前布局选中态。
        expect(
            screen.getByRole("button", { name: "3 列 × 1 行" }).getAttribute("aria-pressed"),
        ).toBe("true");
    });

    it("AC-002：count=0 时不渲染会话排布区", () => {
        render_toolbar();
        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        expect(screen.getByLabelText("显示时间戳")).toBeTruthy();
        expect(screen.getByLabelText("紧凑模式")).toBeTruthy();
        expect(screen.queryByRole("group", { name: "会话排布" })).toBeNull();
    });
});
