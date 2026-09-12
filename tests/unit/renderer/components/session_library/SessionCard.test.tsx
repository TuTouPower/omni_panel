import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCard } from "../../../../../src/renderer/components/session-library/SessionCard";
import type { TokenStatsSession } from "../../../../../src/shared/types/token-stats";

/**
 * 会话库网格卡片（demo SessionCard 对齐）：行1 徽标 + 首条→末条消息时间区间 +
 * hover 勾选框；行2 目录末级 / tokens / 轮次 / IdChip（复制完整会话 ID）；
 * 行3 末条用户消息摘要。无独立标题行。
 */

/** 钉住系统时间为 2026 年，format_compact_datetime 走当年 MMDD HH:mm 格式（t407 同款）。 */
function pin_system_year_2026(): void {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0));
}

function sess(
    id: string,
    source: string,
    opts: {
        calls?: number;
        input_tokens?: number;
        directory?: string | null;
        started_at?: number;
        ended_at?: number;
        title?: string;
    } = {},
): TokenStatsSession {
    return {
        id,
        source: source as TokenStatsSession["source"],
        env: "linux",
        model: "model",
        title: opts.title ?? `会话 ${id}`,
        directory: opts.directory === undefined ? `/proj/${id}` : opts.directory,
        input_tokens: opts.input_tokens ?? 100,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_write_tokens: 25,
        calls: opts.calls ?? 3,
        started_at: opts.started_at ?? 0,
        ended_at: opts.ended_at ?? new Date(2026, 0, 1).getTime(),
    };
}

interface RenderCardOverrides {
    s?: TokenStatsSession;
    summary?: string;
    selected?: boolean;
    on_toggle?: (s: TokenStatsSession) => void;
    on_preview?: (s: TokenStatsSession) => void;
    on_open?: (s: TokenStatsSession) => void;
    show_toast?: (message: string) => void;
}

function render_card(overrides: RenderCardOverrides = {}) {
    const props = {
        s: sess("sess_a", "claude_code"),
        summary: "",
        selected: false,
        on_toggle: vi.fn(),
        on_preview: vi.fn(),
        on_open: vi.fn(),
        ...overrides,
    };
    render(<SessionCard {...props} />);
    return props;
}

function id_chip(): HTMLButtonElement {
    const el = document.querySelector<HTMLButtonElement>('[data-testid="library-card-id-chip"]');
    if (!el) throw new Error("library-card-id-chip missing");
    return el;
}

beforeEach(() => {
    // 清理上个用例可能残留的 navigator.clipboard mock。
    delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("SessionCard（demo 对齐）", () => {
    it("行1 渲染徽标与首条→末条消息时间区间（紧凑格式），title 给精确起止；无标题行", () => {
        pin_system_year_2026();
        const started = new Date(2026, 7, 6, 20, 30, 0).getTime();
        const ended = new Date(2026, 7, 7, 9, 8, 7).getTime();
        render_card({
            s: sess("sess_a", "claude_code", {
                started_at: started,
                ended_at: ended,
                directory: "/path/to/proj",
                title: "某个标题",
            }),
        });
        const range = document.querySelector('[data-testid="library-card-time-range"]');
        if (!range) throw new Error("library-card-time-range missing");
        expect(range.textContent).toContain("0806 20:30 → 0807 09:08");
        expect(range.getAttribute("title")).toBe("2026-08-06 20:30:00 → 2026-08-07 09:08:07");
        // 徽标为 VendorMark logo。
        const badge = document.querySelector('[data-testid="library-card-badge"]');
        expect(badge?.querySelector('[data-testid="vendor-mark"]')).toBeTruthy();
        // demo：无独立标题行，标题文本不出现在卡片里。
        expect(document.querySelector('[data-testid="library-card-title"]')).toBeNull();
        expect(screen.queryByText("某个标题")).toBeNull();
        vi.useRealTimers();
    });

    it("行2 渲染目录末级 / tokens / 轮次 / IdChip（短 id），不渲染完整路径", () => {
        render_card({ s: sess("sess_a", "claude_code", { calls: 5 }) });
        const meta = document.querySelector('[data-testid="library-card-meta"]');
        if (!meta) throw new Error("library-card-meta missing");
        expect(meta.textContent).toContain("5 轮");
        expect(meta.textContent).toContain("375 tokens");
        expect(document.querySelector('[data-testid="library-card-cwd"]')?.textContent).toBe(
            "sess_a",
        );
        expect(meta.textContent).not.toContain("/proj/sess_a");
        expect(id_chip().textContent).toContain("sess_a".slice(0, 8));
    });

    it("directory 为 null 时行2 不渲染目录段", () => {
        render_card({ s: sess("sess_a", "claude_code", { directory: null }) });
        expect(document.querySelector('[data-testid="library-card-cwd"]')).toBeNull();
    });

    it("行3 渲染末条用户消息摘要（单行截断）", () => {
        render_card({ summary: "最后一条用户消息" });
        const summary = document.querySelector('[data-testid="library-card-summary"]');
        expect(summary?.textContent).toBe("最后一条用户消息");
        expect(summary?.getAttribute("title")).toBe("最后一条用户消息");
    });

    it("IdChip 点击复制完整会话 ID：写剪贴板 + 变已复制 + toast", async () => {
        // 复制前即钉假定时器，否则「已复制」回退定时器挂在真实时钟上。
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const write_spy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: write_spy } });
        const toast_spy = vi.fn();
        render_card({ s: sess("sess_abcdefgh", "claude_code"), show_toast: toast_spy });
        fireEvent.click(id_chip());
        await waitFor(() => {
            expect(write_spy).toHaveBeenCalledWith("sess_abcdefgh");
        });
        expect(toast_spy).toHaveBeenCalledWith("已复制");
        expect(id_chip().textContent).toContain("已复制");
        // 1.4s 后恢复短 id。
        act(() => {
            vi.advanceTimersByTime(1500);
        });
        expect(id_chip().textContent).toContain("sess_abc");
        vi.useRealTimers();
    });

    it("IdChip 点击不冒泡触发卡片勾选", async () => {
        const write_spy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: write_spy } });
        const on_toggle = vi.fn();
        render_card({ on_toggle });
        fireEvent.click(id_chip());
        await waitFor(() => {
            expect(write_spy).toHaveBeenCalled();
        });
        expect(on_toggle).not.toHaveBeenCalled();
    });

    it("clipboard API 缺失时点击 IdChip 不抛错、不 toast", () => {
        const toast_spy = vi.fn();
        Object.assign(navigator, { clipboard: undefined });
        render_card({ show_toast: toast_spy });
        expect(() => fireEvent.click(id_chip())).not.toThrow();
        expect(toast_spy).not.toHaveBeenCalled();
    });

    it("勾选框 hover 浮现、选中态常显", () => {
        const { unmount } = ((): { unmount: () => void } => {
            const utils = render(
                <SessionCard
                    s={sess("sess_a", "claude_code")}
                    summary=""
                    selected={false}
                    on_toggle={vi.fn()}
                    on_preview={vi.fn()}
                    on_open={vi.fn()}
                />,
            );
            return utils;
        })();
        let checkbox = screen.getByRole("button", { name: "会话 sess_a" });
        expect(checkbox.parentElement?.className).toContain("opacity-0");
        unmount();
        render(
            <SessionCard
                s={sess("sess_a", "claude_code")}
                summary=""
                selected={true}
                on_toggle={vi.fn()}
                on_preview={vi.fn()}
                on_open={vi.fn()}
            />,
        );
        checkbox = screen.getByRole("button", { name: "会话 sess_a" });
        expect(checkbox.parentElement?.className).toContain("opacity-100");
    });

    it("单独打开 / 预览 / 选择交互不变", () => {
        const on_open = vi.fn();
        const on_preview = vi.fn();
        const on_toggle = vi.fn();
        render_card({ on_open, on_preview, on_toggle });
        fireEvent.click(screen.getByRole("button", { name: "单独打开" }));
        expect(on_open).toHaveBeenCalledWith(expect.objectContaining({ id: "sess_a" }));
        fireEvent.click(screen.getByRole("button", { name: "预览" }));
        expect(on_preview).toHaveBeenCalledWith(expect.objectContaining({ id: "sess_a" }));
        fireEvent.click(screen.getByRole("button", { name: "会话 sess_a" }));
        expect(on_toggle).toHaveBeenCalledWith(expect.objectContaining({ id: "sess_a" }));
    });

    it("t470 AC-003: antigravity 卡片 tokens 显示未知而非 0", () => {
        const agy = sess("agy-1", "antigravity", { calls: 42, directory: null });
        agy.input_tokens = 0;
        agy.output_tokens = 0;
        agy.cache_read_tokens = 0;
        agy.cache_write_tokens = 0;
        render_card({ s: agy });
        const meta = document.querySelector('[data-testid="library-card-meta"]');
        if (!meta) throw new Error("library-card-meta missing");
        expect(meta.textContent).toContain("42 轮");
        expect(meta.textContent).toContain("未知");
        expect(meta.textContent).not.toContain("0 tokens");
    });
});
