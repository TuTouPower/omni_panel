import { fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it } from "vitest";
import { PaneMessageRow } from "../../../../../src/renderer/components/workspace/PaneMessageRow";
import type { HistoryMessageLike } from "../../../../../src/shared/types/ipc";

/** t237 PaneMessageRow memo 化测试：仅变化行重渲染。 */

function msg(id: string, role: "user" | "assistant", text: string): HistoryMessageLike {
    return { id, role, text, timestamp: 0 };
}

describe("PaneMessageRow memo (t237)", () => {
    it("切换一条消息的选中态时，仅目标行重渲染", () => {
        const messages = [
            msg("m1", "user", "第一条"),
            msg("m2", "assistant", "第二条"),
            msg("m3", "user", "第三条"),
        ];
        const counts = { m1: 0, m2: 0, m3: 0 };
        const onRenderById: Record<string, () => void> = {
            m1: () => {
                counts.m1 += 1;
            },
            m2: () => {
                counts.m2 += 1;
            },
            m3: () => {
                counts.m3 += 1;
            },
        };
        function getOnRender(id: string): () => void {
            return onRenderById[id] ?? (() => undefined);
        }

        function Parent() {
            const [selected, setSelected] = useState<Set<string>>(new Set());
            const isSelected = useCallback((id: string) => selected.has(id), [selected]);
            const toggle = useCallback((id: string, shift: boolean) => {
                if (shift) return;
                setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                });
            }, []);
            const hover = useCallback(() => undefined, []);

            return (
                <div>
                    {messages.map((m) => (
                        <PaneMessageRow
                            key={m.id}
                            message={m}
                            selected={isSelected(m.id)}
                            show_time={false}
                            compact={false}
                            on_toggle={toggle}
                            on_hover={hover}
                            onRender={getOnRender(m.id)}
                        />
                    ))}
                </div>
            );
        }

        render(<Parent />);
        expect(counts).toEqual({ m1: 1, m2: 1, m3: 1 });

        // 勾选第二条。
        const checks = screen.getAllByRole("checkbox");
        const target = checks[1];
        if (!target) throw new Error("checkbox missing");
        fireEvent.click(target);
        expect(counts).toEqual({ m1: 1, m2: 2, m3: 1 });

        // 取消勾选第二条。
        fireEvent.click(target);
        expect(counts).toEqual({ m1: 1, m2: 3, m3: 1 });
    });
});

describe("PaneMessageRow 单行折叠 (t257)", () => {
    const base = {
        selected: false,
        show_time: true,
        compact: false,
        on_toggle: () => undefined,
        on_hover: () => undefined,
    };

    // jsdom 无真实布局：mock scrollHeight/clientHeight 控制「超行」判定。
    function mock_content_size(scroll: number, client: number): void {
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
            configurable: true,
            get: () => scroll,
        });
        Object.defineProperty(HTMLElement.prototype, "clientHeight", {
            configurable: true,
            get: () => client,
        });
    }

    it("AC9：超行消息显示展开按钮，单行消息不显示", () => {
        mock_content_size(80, 20);
        const { rerender } = render(
            <PaneMessageRow {...base} message={msg("m1", "user", "x".repeat(200))} />,
        );
        expect(screen.getByLabelText("展开消息")).toBeTruthy();

        mock_content_size(20, 20);
        rerender(<PaneMessageRow {...base} message={msg("m2", "user", "short")} />);
        expect(screen.queryByLabelText("展开消息")).toBeNull();
    });

    it("AC9/AC10：默认折叠（single-line class），点击展开移除折叠，再点恢复", () => {
        mock_content_size(80, 20);
        render(<PaneMessageRow {...base} message={msg("m1", "user", "x".repeat(200))} />);
        // 默认折叠。
        expect(document.querySelector(".pane-msg-content")?.classList.contains("single-line")).toBe(
            true,
        );

        // 点击展开 → 移除折叠 class。
        fireEvent.click(screen.getByLabelText("展开消息"));
        expect(document.querySelector(".pane-msg-content")?.classList.contains("single-line")).toBe(
            false,
        );

        // 再点 → 恢复折叠。
        fireEvent.click(screen.getByLabelText("折叠消息"));
        expect(document.querySelector(".pane-msg-content")?.classList.contains("single-line")).toBe(
            true,
        );
    });

    it("AC11：展开/折叠不改变选中态（checkbox 保持）", () => {
        mock_content_size(80, 20);
        const on_toggle = (id: string, shift: boolean) => void [id, shift];
        render(
            <PaneMessageRow
                {...base}
                message={msg("m1", "user", "x".repeat(200))}
                selected
                on_toggle={on_toggle}
            />,
        );
        const check = screen.getByLabelText(/选择消息/);
        expect(check).toBeChecked();

        fireEvent.click(screen.getByLabelText("展开消息"));
        expect(screen.getByLabelText(/选择消息/)).toBeChecked();
    });
});
