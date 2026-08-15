import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionRail } from "../../../../../src/renderer/components/workspace/SessionRail";
import {
    empty_slots,
    MAX_SLOTS,
    session_meta,
    try_assign_slot,
    type SlotsState,
} from "../../../../../src/renderer/lib/workspace/slots";
import type { TokenStatsSession } from "../../../../../src/shared/types/token-stats";

function sess(id: string, source: string): TokenStatsSession {
    return {
        id,
        source: source as TokenStatsSession["source"],
        env: "local",
        model: "model",
        title: `会话 ${id}`,
        directory: null,
        input_tokens: 100,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_write_tokens: 25,
        calls: 3,
        started_at: 1000,
        ended_at: 2000,
    };
}

function slots_with_sources(sources: readonly string[]): SlotsState {
    let slots = empty_slots();
    sources.forEach((source, index) => {
        slots = try_assign_slot(
            slots,
            index,
            session_meta(sess(`sess_${String(index)}`, source), 1),
        ).next;
    });
    return slots;
}

const noop = (): void => undefined;

function require_el(root: ParentNode, selector: string): HTMLElement {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`元素未渲染: ${selector}`);
    return el;
}

describe("SessionRail provider 徽标", () => {
    it("四个已知 source 与未知 source 都使用 VendorMark", () => {
        render(
            <SessionRail
                slots={slots_with_sources([
                    "claude_code",
                    "kimi_code",
                    "grok",
                    "opencode",
                    "unknown",
                ])}
                collapsed={false}
                on_toggle_collapse={noop}
                on_pick={noop}
                on_close={noop}
                on_move={noop}
            />,
        );

        const badges = Array.from(document.querySelectorAll(".session-badge"));
        expect(badges).toHaveLength(5);
        // t314: badge 无 accent 圆环描边（防「icon 套圈」回归）。
        for (const badge of badges) {
            expect(badge.className).not.toMatch(/\bring-/);
        }
        const expected = [
            { light: "claude" },
            { light: "kimi" },
            { light: "grok_light", dark: "grok_dark" },
            { light: "opencode_go_light", dark: "opencode_go_dark" },
            { fallback: true },
        ] as const;
        badges.forEach((badge, index) => {
            expect(badge.querySelector('[data-testid="vendor-mark"]')).toBeTruthy();
            const expected_logo = expected[index];
            if (!expected_logo || "fallback" in expected_logo) {
                expect(badge.querySelector("svg")).toBeTruthy();
                return;
            }
            const sources = Array.from(badge.querySelectorAll("img")).map(
                (img) => img.getAttribute("src") ?? "",
            );
            expect(sources.some((src) => src.includes(expected_logo.light))).toBe(true);
            if ("dark" in expected_logo) {
                expect(sources.some((src) => src.includes(expected_logo.dark))).toBe(true);
            }
        });
    });
});

describe("SessionRail t257 展示调整", () => {
    const base = {
        slots: slots_with_sources(["claude_code", "kimi_code"]),
        collapsed: false,
        on_toggle_collapse: noop,
        on_pick: noop,
        on_close: noop,
        on_move: noop,
    };

    it("AC5：槽位不渲染 provider 颜色条（session-slot-accent）", () => {
        render(<SessionRail {...base} />);
        expect(document.querySelector(".session-slot-accent")).toBeNull();
    });

    it("AC6：折叠态空槽只显示「+」", () => {
        const { container } = render(
            <SessionRail {...base} slots={empty_slots()} collapsed={true} />,
        );
        const empty_btns = Array.from(container.querySelectorAll(".session-slot-empty"));
        expect(empty_btns.length).toBeGreaterThan(0);
        for (const b of empty_btns) {
            expect(b.textContent.trim()).toBe("+");
        }
    });

    it("展开态空槽显示「+ 添加会话」文案", () => {
        const { container } = render(
            <SessionRail {...base} slots={empty_slots()} collapsed={false} />,
        );
        const empty_btns = Array.from(container.querySelectorAll(".session-slot-empty"));
        expect(empty_btns.length).toBeGreaterThan(0);
        for (const b of empty_btns) {
            expect(b.textContent.trim()).toBe("+ 添加会话");
        }
    });

    it("t406 AC-002：侧边栏背景 surface-window，无 color-mix", () => {
        const { container } = render(<SessionRail {...base} />);
        const rail = container.querySelector(".session-rail");
        const cls = rail?.className ?? "";
        expect(cls).toContain("bg-[var(--color-surface-window)]");
        expect(cls).not.toContain("color-mix");
        expect(cls).not.toContain("bg-[var(--color-surface)]");
        expect(cls).not.toContain("bg-[var(--color-surface-raised)]");
    });

    it("t381 AC-002：非空槽位卡片用 surface-card，不含 surface-window", () => {
        const { container } = render(<SessionRail {...base} />);
        const slot = container.querySelector(".session-slot:not(.session-slot-empty)");
        const cls = slot?.className ?? "";
        expect(cls).toContain("var(--color-surface-card)");
        expect(cls).not.toContain("bg-[var(--color-surface-window)]");
    });

    it("t381 AC-004：空槽位保持 bg-transparent + dashed 边框", () => {
        const { container } = render(
            <SessionRail {...base} slots={empty_slots()} collapsed={false} />,
        );
        const empty = container.querySelector(".session-slot-empty");
        const cls = empty?.className ?? "";
        expect(cls).toContain("bg-transparent");
        expect(cls).toContain("border-dashed");
    });
});

describe("SessionRail t413 头部折叠 + 底部固定添加", () => {
    const base = {
        slots: slots_with_sources(["claude_code", "kimi_code"]),
        collapsed: false,
        on_toggle_collapse: noop,
        on_pick: noop,
        on_close: noop,
        on_move: noop,
    };

    it("AC-002：折叠按钮在 session-rail-header 内，点击触发 on_toggle_collapse", () => {
        const on_toggle_collapse = vi.fn();
        render(<SessionRail {...base} on_toggle_collapse={on_toggle_collapse} />);
        const toggle = screen.getByRole("button", { name: "折叠槽位栏" });
        expect(toggle.closest(".session-rail-header")).not.toBeNull();
        fireEvent.click(toggle);
        expect(on_toggle_collapse).toHaveBeenCalledTimes(1);
    });

    it("AC-003：展开态底部固定「添加会话」，footer 有 border-t 发丝分隔，不在 scroll 区", () => {
        const { container } = render(<SessionRail {...base} collapsed={false} />);
        const add = require_el(container, ".session-slot-add");
        expect(add.textContent.trim()).toBe("+ 添加会话");
        const footer = add.closest(".session-rail-footer");
        if (!footer) throw new Error("footer missing");
        expect(footer.className).toMatch(/border-t/);
        expect(footer.className).toMatch(/shrink-0/);
        // 不在可滚动列表内。
        expect(add.closest(".session-rail-scroll")).toBeNull();
        // 列表区可滚、footer 在 rail 根下与 scroll 并列。
        const rail = require_el(container, ".session-rail");
        expect(rail.contains(footer)).toBe(true);
        expect(footer.previousElementSibling?.className).toMatch(/session-rail-scroll/);
    });

    it("AC-004：折叠态添加入口为加号 icon（无文字「添加会话」）", () => {
        const { container } = render(<SessionRail {...base} collapsed={true} />);
        const add = require_el(container, ".session-slot-add");
        expect(add.textContent.trim()).toBe("+");
        expect(add.textContent).not.toMatch(/添加会话/);
    });

    it("AC-005：展开/折叠态点击底部添加会话均 on_pick 首个空槽", () => {
        const on_pick = vi.fn();
        // 槽 0、1 占用 → 首空槽 index=2
        const { rerender, container } = render(
            <SessionRail {...base} on_pick={on_pick} collapsed={false} />,
        );
        fireEvent.click(require_el(container, ".session-slot-add"));
        expect(on_pick).toHaveBeenCalledWith(2);

        on_pick.mockClear();
        rerender(<SessionRail {...base} on_pick={on_pick} collapsed={true} />);
        fireEvent.click(require_el(container, ".session-slot-add"));
        expect(on_pick).toHaveBeenCalledWith(2);
    });

    it("满槽时底部添加会话 disabled", () => {
        const sources = Array.from({ length: MAX_SLOTS }, () => "claude_code");
        const on_pick = vi.fn();
        const { container } = render(
            <SessionRail
                {...base}
                slots={slots_with_sources(sources)}
                on_pick={on_pick}
                collapsed={false}
            />,
        );
        const add = require_el(container, ".session-slot-add");
        expect(add).toBeInstanceOf(HTMLButtonElement);
        expect((add as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(add);
        expect(on_pick).not.toHaveBeenCalled();
    });
});
