import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCard } from "../../../../../src/renderer/components/session-library/SessionCard";
import type { TokenStatsSession } from "../../../../../src/shared/types/token-stats";

/**
 * t326 会话库卡片三行重排：VendorMark 徽标；cwd 末级+首条→末条消息时间区间 /
 * 轮次·tokens·session id / 会话名；session id 点击复制续接命令（复用 t324 分派）。
 */

/** 钉住系统时间为 2026 年，format_compact_datetime 走当年 MMDD HH:mm 格式（t407 同款）。 */
function pin_system_year_2026(): void {
    vi.useFakeTimers();
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
    selected?: boolean;
    on_toggle?: (s: TokenStatsSession) => void;
    on_preview?: (s: TokenStatsSession) => void;
    on_open?: (s: TokenStatsSession) => void;
    show_toast?: (message: string) => void;
}

function render_card(overrides: RenderCardOverrides = {}) {
    const props = {
        s: sess("sess_a", "claude_code"),
        selected: false,
        on_toggle: vi.fn(),
        on_preview: vi.fn(),
        on_open: vi.fn(),
        ...overrides,
    };
    render(<SessionCard {...props} />);
    return props;
}

/** 第二行 session id 按钮（目录末级可能与 id 同文本，用类选择器定位）。 */
function session_id_button(): HTMLButtonElement {
    const el = document.querySelector<HTMLButtonElement>('[data-testid="library-card-session-id"]');
    if (!el) throw new Error("library-card-session-id missing");
    return el;
}

beforeEach(() => {
    // 清理上个用例可能残留的 navigator.clipboard mock。
    delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("SessionCard (t326)", () => {
    it("AC1：第一行渲染 cwd 末级与首条→末条消息时间区间（紧凑格式），title 给精确起止", () => {
        pin_system_year_2026();
        const started = new Date(2026, 7, 6, 20, 30, 0).getTime();
        const ended = new Date(2026, 7, 7, 9, 8, 7).getTime();
        render_card({
            s: sess("sess_a", "claude_code", {
                started_at: started,
                ended_at: ended,
                directory: "/path/to/proj",
            }),
        });
        const first = document.querySelector('[data-testid="library-card-top"]');
        if (!first) throw new Error("library-card-top missing");
        expect(first.textContent).toContain("proj");
        expect(first.textContent).toContain("0806 20:30 → 0807 09:08");
        expect(first.textContent).not.toContain("/path/to/proj");
        expect(document.querySelector('[data-testid="library-card-cwd"]')?.textContent).toBe(
            "proj",
        );
        const range = document.querySelector('[data-testid="library-card-time-range"]');
        if (!range) throw new Error("library-card-time-range missing");
        expect(range.getAttribute("title")).toBe("2026-08-06 20:30:00 → 2026-08-07 09:08:07");
        vi.useRealTimers();
    });

    it("AC1：directory 为空时第一行仅渲染时间区间", () => {
        pin_system_year_2026();
        const started = new Date(2026, 0, 1, 22, 15, 0).getTime();
        const ended = new Date(2026, 0, 2, 3, 4, 5).getTime();
        render_card({
            s: sess("sess_a", "claude_code", {
                directory: null,
                started_at: started,
                ended_at: ended,
            }),
        });
        const first = document.querySelector('[data-testid="library-card-top"]');
        if (!first) throw new Error("library-card-top missing");
        expect(first.textContent).toContain("0101 22:15 → 0102 03:04");
        expect(document.querySelector('[data-testid="library-card-cwd"]')).toBeNull();
        const range = document.querySelector('[data-testid="library-card-time-range"]');
        if (!range) throw new Error("library-card-time-range missing");
        expect(range.getAttribute("title")).toBe("2026-01-01 22:15:00 → 2026-01-02 03:04:05");
        vi.useRealTimers();
    });

    it("AC2：第二行渲染 轮次 / tokens / session id（内容与数据源一致）", () => {
        render_card({ s: sess("sess_a", "claude_code", { calls: 5 }) });
        const second = document.querySelector('[data-testid="library-card-meta"]');
        if (!second) throw new Error("library-card-meta missing");
        expect(second.textContent).toContain("5 轮");
        expect(second.textContent).toContain("375 tokens");
        expect(second.textContent).toContain("sess_a");
    });

    it("AC3：第三行渲染会话名（单行），摘要行不再渲染", () => {
        render_card({ s: sess("sess_a", "claude_code", { title: "会话标题" }) });
        const third = document.querySelector('[data-testid="library-card-title"]');
        if (!third) throw new Error("library-card-title missing");
        expect(third.textContent).toContain("会话标题");
        expect(document.querySelector(".library-card-summary")).toBeNull();
    });

    it("AC4：徽标渲染 VendorMark logo，不再渲染 agent 字母缩写", () => {
        render_card({ s: sess("sess_a", "claude_code") });
        const badge = document.querySelector('[data-testid="library-card-badge"]');
        if (!badge) throw new Error("library-card-badge missing");
        expect(badge.querySelector('[data-testid="vendor-mark"]')).toBeTruthy();
        expect(badge.textContent).toBe("");
    });

    it.each([
        ["claude_code", "claude --resume sess_a"],
        ["kimi_code", "kimi -r sess_a"],
        ["grok", "grok --resume sess_a"],
        ["opencode", "opencode -s sess_a"],
    ] as const)(
        "AC5：%s 来源点击 session id 复制 %s 并显示已复制 toast",
        async (source, expected) => {
            const write_spy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, { clipboard: { writeText: write_spy } });
            const toast_spy = vi.fn();
            render_card({ s: sess("sess_a", source), show_toast: toast_spy });
            fireEvent.click(session_id_button());
            await waitFor(() => {
                expect(write_spy).toHaveBeenCalledWith(expected);
            });
            expect(toast_spy).toHaveBeenCalledWith("已复制");
        },
    );

    it("AC5：未知来源点击 session id 不写剪贴板、不显示 toast", () => {
        const write_spy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: write_spy } });
        const toast_spy = vi.fn();
        render_card({ s: sess("sess_a", "unknown"), show_toast: toast_spy });
        fireEvent.click(session_id_button());
        expect(write_spy).not.toHaveBeenCalled();
        expect(toast_spy).not.toHaveBeenCalled();
    });

    it("AC5：clipboard API 缺失时点击 session id 不抛错、不 toast", () => {
        const toast_spy = vi.fn();
        Object.assign(navigator, { clipboard: undefined });
        render_card({ s: sess("sess_a", "claude_code"), show_toast: toast_spy });
        expect(() => fireEvent.click(session_id_button())).not.toThrow();
        expect(toast_spy).not.toHaveBeenCalled();
    });

    it("AC6：单独打开 / 预览 / 选择交互不变", () => {
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
});

describe("SessionCard 自定义续接命令模板 (t403)", () => {
    const base_cfg = {
        schemaVersion: 1 as const,
        language: "zh-Hans" as const,
        launchAtLogin: false,
        plugins: [],
    };

    function mock_config(resumeCommandTemplates?: Readonly<Partial<Record<string, string>>>): void {
        window.usageboard.config.get = vi.fn().mockResolvedValue({
            config: {
                ...base_cfg,
                ...(resumeCommandTemplates ? { resumeCommandTemplates } : {}),
            },
            hasSecrets: {},
        });
    }

    beforeEach(() => {
        delete (navigator as { clipboard?: unknown }).clipboard;
    });

    it("AC-002：配置 kimi 自定义模板后点击 session id 复制替换后命令", async () => {
        mock_config({ kimi_code: "kimi --yolo -r {session_id}" });
        const write_spy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: write_spy } });
        const toast_spy = vi.fn();
        render_card({ s: sess("sess_kimi", "kimi_code"), show_toast: toast_spy });
        await waitFor(() => {
            expect(session_id_button().title).toBe("kimi --yolo -r sess_kimi");
        });
        fireEvent.click(session_id_button());
        await waitFor(() => {
            expect(write_spy).toHaveBeenCalledWith("kimi --yolo -r sess_kimi");
        });
        expect(toast_spy).toHaveBeenCalledWith("已复制");
    });

    it("AC-003：未配置自定义模板的来源仍复制内置默认命令", async () => {
        mock_config({ kimi_code: "kimi --yolo -r {session_id}" });
        const write_spy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: write_spy } });
        const toast_spy = vi.fn();
        render_card({ s: sess("sess_a", "claude_code"), show_toast: toast_spy });
        await waitFor(() => {
            expect(session_id_button().title).toBe("claude --resume sess_a");
        });
        fireEvent.click(session_id_button());
        await waitFor(() => {
            expect(write_spy).toHaveBeenCalledWith("claude --resume sess_a");
        });
        expect(toast_spy).toHaveBeenCalledWith("已复制");
    });

    it("AC-004：clipboard 缺失时静默跳过、无 toast", async () => {
        mock_config({ kimi_code: "kimi --yolo -r {session_id}" });
        const toast_spy = vi.fn();
        Object.assign(navigator, { clipboard: undefined });
        render_card({ s: sess("sess_kimi", "kimi_code"), show_toast: toast_spy });
        await waitFor(() => {
            expect(session_id_button().title).toBe("kimi --yolo -r sess_kimi");
        });
        expect(() => fireEvent.click(session_id_button())).not.toThrow();
        expect(toast_spy).not.toHaveBeenCalled();
    });
});
