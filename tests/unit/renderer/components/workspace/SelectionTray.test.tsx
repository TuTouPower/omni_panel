import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    SelectionTray,
    clamp_tray_height,
} from "../../../../../src/renderer/components/workspace/SelectionTray";
import {
    reset_selection_store,
    selection_store,
} from "../../../../../src/renderer/lib/workspace/selection-store";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * t226 摘选托盘组件测试。
 * 覆盖：空态细条、片段 chip（agent/角色序号/摘要/token/移除）、片段数/total tokens、
 * 三格式复制写剪贴板、清空。
 */

const LOC_A = { source: "claude_code", env: "win", session_id: "a" };
const LOC_B = { source: "opencode", env: "win", session_id: "b" };

function item(loc: typeof LOC_A, id: string, role: "user" | "assistant", text: string) {
    return {
        key: `${loc.source}|${loc.env}|${loc.session_id}|${id}`,
        loc,
        message: { id, role, text, timestamp: 100 },
        role_index: 1,
        session_title: `会话${id.toUpperCase()}`,
    };
}

beforeEach(() => {
    reset_selection_store();
    install_history_usageboard();
});

describe("SelectionTray (t226)", () => {
    it("空态收成细条（collapsed，无片段）", () => {
        render(<SelectionTray />);
        const tray = document.querySelector<HTMLElement>(".selection-tray");
        expect(tray?.className).not.toContain("expanded");
        expect(screen.getByText("摘选托盘（空）")).toBeTruthy();
        expect(tray?.style.height).toBe("40px");
    });

    it("有内容展开到内容高，清空回细条（f002）", () => {
        render(<SelectionTray />);
        act(() => {
            selection_store.toggle(item(LOC_A, "m1", "user", "甲"));
        });
        const tray = document.querySelector<HTMLElement>(".selection-tray");
        expect(tray?.style.height).toBe("160px");
        fireEvent.click(screen.getByRole("button", { name: "清空摘选" }));
        expect(document.querySelector<HTMLElement>(".selection-tray")?.style.height).toBe("40px");
    });

    it("选中后展开，chip 显示 agent 缩写/角色序号/摘要/token", () => {
        render(<SelectionTray />);
        act(() => {
            selection_store.toggle(item(LOC_A, "m1", "user", "修复登录 bug 的内容"));
        });
        expect(document.querySelector(".selection-tray")?.className).toContain("expanded");
        expect(screen.getByText("C")).toBeTruthy();
        expect(screen.getByText("U1")).toBeTruthy();
        expect(screen.getByText(/修复登录 bug/)).toBeTruthy();
        expect(screen.getByText(/1 片段/)).toBeTruthy();
    });

    it("chip 单条移除", () => {
        render(<SelectionTray />);
        act(() => {
            selection_store.toggle(item(LOC_A, "m1", "user", "甲"));
            selection_store.toggle(item(LOC_B, "m2", "assistant", "乙"));
        });
        expect(screen.getByText(/2 片段/)).toBeTruthy();
        const remove_btns = screen.getAllByLabelText(/移除片段/);
        const remove_btn = remove_btns[0];
        if (!remove_btn) throw new Error("remove button missing");
        fireEvent.click(remove_btn);
        expect(screen.getByText(/1 片段/)).toBeTruthy();
    });

    it("三格式复制写剪贴板", async () => {
        const write_spy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: write_spy } });
        render(<SelectionTray />);
        act(() => {
            selection_store.toggle(item(LOC_A, "m1", "user", "修复登录 bug"));
        });
        await waitFor(() => {
            expect(document.querySelector(".selection-tray")?.className).toContain("expanded");
        });
        const select = screen.getByLabelText("复制格式");
        const copy_btn = [...document.querySelectorAll<HTMLElement>(".tray-btn")].find(
            (b) => !b.className.includes("tray-btn-clear"),
        );
        if (!copy_btn) throw new Error("copy button missing");
        for (const [format, marker] of [
            ["markdown", "## 会话"],
            ["plain", "修复登录 bug"],
            ["grouped", "# 会话"],
        ] as const) {
            fireEvent.change(select, { target: { value: format } });
            fireEvent.click(copy_btn);
            await waitFor(() => {
                const called = write_spy.mock.calls.at(-1)?.[0] as string | undefined;
                expect(called).toContain(marker);
            });
        }
    });

    it("拖拽高度 clamp 到 [40, 320]（f008）", () => {
        expect(clamp_tray_height(160, 500)).toBe(320);
        expect(clamp_tray_height(160, -500)).toBe(40);
        expect(clamp_tray_height(160, 20)).toBe(180);
    });

    it("清空按钮清除全部片段", () => {
        render(<SelectionTray />);
        act(() => {
            selection_store.toggle(item(LOC_A, "m1", "user", "甲"));
            selection_store.toggle(item(LOC_B, "m2", "assistant", "乙"));
        });
        expect(screen.getByText(/2 片段/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "清空摘选" }));
        expect(screen.getByText("摘选托盘（空）")).toBeTruthy();
    });
});
