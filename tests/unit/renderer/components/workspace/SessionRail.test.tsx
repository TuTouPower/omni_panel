import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionRail } from "../../../../../src/renderer/components/workspace/SessionRail";
import {
    empty_slots,
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
                on_pick={() => undefined}
                on_close={() => undefined}
                on_move={() => undefined}
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
        on_pick: () => undefined,
        on_close: () => undefined,
        on_move: () => undefined,
    };

    it("AC5：槽位不渲染 provider 颜色条（session-slot-accent）", () => {
        render(<SessionRail {...base} />);
        expect(document.querySelector(".session-slot-accent")).toBeNull();
    });

    it("AC6：折叠态空槽只显示「+」；AC7：底部无「添加会话」按钮", () => {
        render(<SessionRail {...base} collapsed={false} />);
        // AC7：底部添加按钮移除。
        expect(document.querySelector(".session-slot-add")).toBeNull();

        // AC6：折叠态空槽按钮文案为「+」。
        const { container } = render(
            <SessionRail
                {...base}
                slots={empty_slots()}
                collapsed={true}
                on_pick={() => undefined}
                on_close={() => undefined}
                on_move={() => undefined}
            />,
        );
        const empty_btns = Array.from(container.querySelectorAll(".session-slot-empty"));
        expect(empty_btns.length).toBeGreaterThan(0);
        for (const b of empty_btns) {
            expect(b.textContent.trim()).toBe("+");
        }
    });

    it("展开态空槽显示「+ 添加会话」文案", () => {
        const { container } = render(
            <SessionRail
                {...base}
                slots={empty_slots()}
                collapsed={false}
                on_pick={() => undefined}
                on_close={() => undefined}
                on_move={() => undefined}
            />,
        );
        const empty_btns = Array.from(container.querySelectorAll(".session-slot-empty"));
        expect(empty_btns.length).toBeGreaterThan(0);
        for (const b of empty_btns) {
            expect(b.textContent.trim()).toBe("+ 添加会话");
        }
    });

    it("t381 AC-001：侧边栏用混色背景，不含桌面衬底色 surface", () => {
        const { container } = render(<SessionRail {...base} />);
        const rail = container.querySelector(".session-rail");
        const cls = rail?.className ?? "";
        expect(cls).toContain("color-mix");
        expect(cls).toContain("var(--color-surface-window)");
        expect(cls).not.toContain("bg-[var(--color-surface)]");
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
