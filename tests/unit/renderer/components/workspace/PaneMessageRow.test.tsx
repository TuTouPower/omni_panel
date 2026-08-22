import { fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaneMessageRow } from "../../../../../src/renderer/components/workspace/PaneMessageRow";
import type { HistoryMessageLike } from "../../../../../src/shared/types/ipc";

/** t237 PaneMessageRow memo 化测试：仅变化行重渲染。 */

function msg(id: string, role: "user" | "assistant", text: string): HistoryMessageLike {
    return { id, role, text, timestamp: 0 };
}

function is_collapsed(root: ParentNode | Document = document): boolean {
    return Boolean(
        root
            .querySelector('[data-testid="conversation-message-content"]')
            ?.classList.contains("single-line"),
    );
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
                            show_role_label
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

describe("PaneMessageRow 点击本体展开 (t408)", () => {
    const base = {
        selected: false,
        show_role_label: true,
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

    afterEach(() => {
        // 恢复尺寸 getter，避免污染后续用例。
        delete (HTMLElement.prototype as { scrollHeight?: unknown }).scrollHeight;
        delete (HTMLElement.prototype as { clientHeight?: unknown }).clientHeight;
        vi.restoreAllMocks();
    });

    it("AC-001：消息行无「展开」「收起」按钮", () => {
        mock_content_size(80, 20);
        render(<PaneMessageRow {...base} message={msg("m1", "user", "x".repeat(200))} />);
        expect(screen.queryByRole("button", { name: /展开|收起/ })).toBeNull();
        expect(screen.queryByLabelText("展开消息")).toBeNull();
        expect(screen.queryByLabelText("折叠消息")).toBeNull();
        expect(screen.queryByText("展开")).toBeNull();
        expect(screen.queryByText("收起")).toBeNull();
    });

    it("AC-002：点击超行消息本体切换折叠/展开，各消息独立", () => {
        mock_content_size(80, 20);
        render(
            <div>
                <PaneMessageRow {...base} message={msg("m1", "user", "x".repeat(200))} />
                <PaneMessageRow {...base} message={msg("m2", "assistant", "y".repeat(200))} />
            </div>,
        );
        const rows = document.querySelectorAll("[data-message-id]");
        const row1 = rows[0];
        const row2 = rows[1];
        if (!row1 || !row2) throw new Error("rows missing");

        expect(is_collapsed(row1)).toBe(true);
        expect(is_collapsed(row2)).toBe(true);

        const content1 = row1.querySelector('[data-testid="conversation-message-content"]');
        if (!content1) throw new Error("content1 missing");
        fireEvent.click(content1);
        expect(is_collapsed(row1)).toBe(false);
        expect(is_collapsed(row2)).toBe(true);

        fireEvent.click(content1);
        expect(is_collapsed(row1)).toBe(true);
        expect(is_collapsed(row2)).toBe(true);

        const content2 = row2.querySelector('[data-testid="conversation-message-content"]');
        if (!content2) throw new Error("content2 missing");
        fireEvent.click(content2);
        expect(is_collapsed(row1)).toBe(true);
        expect(is_collapsed(row2)).toBe(false);
    });

    it("AC-003：用户消息有 primary-container 背景，Agent 无", () => {
        mock_content_size(20, 20);
        render(
            <div>
                <PaneMessageRow {...base} message={msg("u1", "user", "hello")} />
                <PaneMessageRow {...base} message={msg("a1", "assistant", "hi")} />
            </div>,
        );
        const user_body = document.querySelector(
            '[data-message-id="u1"] [data-testid="conversation-message-body"]',
        );
        const agent_body = document.querySelector(
            '[data-message-id="a1"] [data-testid="conversation-message-body"]',
        );
        expect(user_body?.className).toMatch(/bg-\[var\(--color-primary-container\)\]/);
        expect(agent_body?.className).not.toMatch(/bg-\[var\(--color-primary-container\)\]/);
    });

    it("AC-004：点击 checkbox 只改选中态，不触发展开切换", () => {
        mock_content_size(80, 20);
        const on_toggle = vi.fn();
        render(
            <PaneMessageRow
                {...base}
                message={msg("m1", "user", "x".repeat(200))}
                on_toggle={on_toggle}
            />,
        );
        expect(is_collapsed()).toBe(true);
        fireEvent.click(screen.getByLabelText(/选择消息/));
        expect(on_toggle).toHaveBeenCalledWith("m1", false);
        expect(is_collapsed()).toBe(true);
    });

    it("AC-005：文本拖选后松开不切换展开", () => {
        mock_content_size(80, 20);
        render(<PaneMessageRow {...base} message={msg("m1", "user", "x".repeat(200))} />);
        expect(is_collapsed()).toBe(true);

        const content = document.querySelector('[data-testid="conversation-message-content"]');
        if (!content) throw new Error("content missing");

        // 模拟拖选后产生非空文本选区。
        const range = document.createRange();
        range.selectNodeContents(content);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        expect(selection?.isCollapsed).toBe(false);

        fireEvent.click(content);
        expect(is_collapsed()).toBe(true);
    });

    it("AC-006：不超行消息点击无折叠/展开变化", () => {
        mock_content_size(20, 20);
        render(<PaneMessageRow {...base} message={msg("m1", "user", "short")} />);
        expect(is_collapsed()).toBe(true);
        const content = document.querySelector('[data-testid="conversation-message-content"]');
        if (!content) throw new Error("content missing");
        fireEvent.click(content);
        expect(is_collapsed()).toBe(true);
    });

    it("紧凑模式保留消息元信息的内联布局", () => {
        render(<PaneMessageRow {...base} compact message={msg("m1", "user", "short")} />);
        const meta = document.querySelector('[data-testid="conversation-message-meta"]');
        expect(meta?.classList.contains("inline-flex")).toBe(true);
        expect(meta?.classList.contains("mb-0.5")).toBe(false);
    });

    it("展开/折叠不改变选中态（checkbox 保持）", () => {
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

        const content = document.querySelector('[data-testid="conversation-message-content"]');
        if (!content) throw new Error("content missing");
        fireEvent.click(content);
        expect(screen.getByLabelText(/选择消息/)).toBeChecked();
        expect(is_collapsed()).toBe(false);
    });
});

describe("PaneMessageRow 角色标签去重与时间跟展开态 (t427)", () => {
    const base = {
        selected: false,
        show_role_label: true,
        compact: false,
        on_toggle: () => undefined,
        on_hover: () => undefined,
    };

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

    afterEach(() => {
        delete (HTMLElement.prototype as { scrollHeight?: unknown }).scrollHeight;
        delete (HTMLElement.prototype as { clientHeight?: unknown }).clientHeight;
        vi.restoreAllMocks();
    });

    function time_nodes(root: ParentNode = document): Element[] {
        return Array.from(root.querySelectorAll('[data-testid="conversation-message-time"]'));
    }

    it("AC-001/AC-002：show_role_label=true 渲染角色文案，false 不渲染", () => {
        const { rerender } = render(
            <PaneMessageRow {...base} message={msg("m1", "user", "hi")} show_role_label />,
        );
        expect(screen.getByText("用户")).toBeTruthy();
        rerender(
            <PaneMessageRow {...base} message={msg("m1", "user", "hi")} show_role_label={false} />,
        );
        expect(screen.queryByText("用户")).toBeNull();
        // assistant 同理
        rerender(
            <PaneMessageRow {...base} message={msg("m2", "assistant", "yo")} show_role_label />,
        );
        expect(screen.getByText("Agent")).toBeTruthy();
        rerender(
            <PaneMessageRow
                {...base}
                message={msg("m2", "assistant", "yo")}
                show_role_label={false}
            />,
        );
        expect(screen.queryByText("Agent")).toBeNull();
    });

    it("AC-006：折叠态不显示时间戳，展开态显示（timestamp 非空）", () => {
        mock_content_size(80, 20);
        render(<PaneMessageRow {...base} message={msg("m1", "user", "x".repeat(200))} />);
        expect(time_nodes()).toHaveLength(0);
        const content = document.querySelector('[data-testid="conversation-message-content"]');
        if (!content) throw new Error("content missing");
        fireEvent.click(content);
        expect(is_collapsed()).toBe(false);
        expect(time_nodes()).toHaveLength(1);
    });

    it("AC-007：时间显示与 show_time 无关（该 prop 已移除），timestamp null 不显示", () => {
        mock_content_size(80, 20);
        const null_ts = { ...msg("m1", "user", "x".repeat(200)), timestamp: null };
        render(<PaneMessageRow {...base} message={null_ts} />);
        const content = document.querySelector('[data-testid="conversation-message-content"]');
        if (!content) throw new Error("content missing");
        fireEvent.click(content);
        expect(time_nodes()).toHaveLength(0); // timestamp null 不显示
    });

    it("AC-003：行本体带统一非零垂直间距类（py-1，不随组内/组间变化）", () => {
        render(<PaneMessageRow {...base} message={msg("m1", "user", "hi")} />);
        const row = document.querySelector('[data-testid="conversation-message-row"]');
        expect(row?.className).toContain("py-1");
    });
});
