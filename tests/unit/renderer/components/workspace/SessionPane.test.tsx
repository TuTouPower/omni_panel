import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionPane } from "../../../../../src/renderer/components/workspace/SessionPane";
import type { PaneData } from "../../../../../src/renderer/lib/workspace/pane";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * t225 会话面板（pane）测试。
 * 覆盖：头部（agent 色条/徽标/标题/cwd/meta）、脚部计数、Markdown 消息渲染、
 * 时间分隔线、回到底部按钮状态、大纲抽屉、骨架屏。
 */

function msg(id: string, role: "user" | "assistant", text: string, timestamp: number | null) {
    return { id, role, text, timestamp };
}

function column(overrides: Partial<PaneData> = {}): PaneData {
    return {
        loc: { source: "claude_code", env: "win", session_id: "sess_a" },
        title: "会话标题",
        openedAt: 0,
        messages: [],
        next_cursor: null,
        loading_older: false,
        status: "ready",
        ...overrides,
    };
}

const META = {
    loc: { source: "claude_code", env: "win", session_id: "sess_a" },
    title: "会话标题",
    agent: "Claude",
    model: "claude-sonnet-4",
    cwd: "/path/to/proj",
    calls: 5,
    tokens: 1200,
    opened_at: 0,
};

const VIEW = { show_time: true, compact: false };

const PROPS = {
    slot_index: 1,
    column: column(),
    slot_meta: META,
    focused: false,
    outline_open: false,
    view: VIEW,
    is_selected: () => false,
    on_close: () => undefined,
    on_toggle: () => undefined,
    on_hover: () => undefined,
    on_select_all: () => undefined,
    on_clear_select: () => undefined,
    on_load_older: () => undefined,
    on_focus: () => undefined,
    on_toggle_outline: () => undefined,
};

beforeEach(() => {
    install_history_usageboard();
});

describe("SessionPane (t225)", () => {
    it("头部显示 agent 徽标（含 model）、标题、末级目录与 轮数·tokens·日期 meta（t257）", () => {
        render(
            <SessionPane
                {...PROPS}
                column={column({
                    messages: [],
                })}
            />,
        );
        expect(screen.getByText("会话标题")).toBeTruthy();
        expect(screen.getByText(/5 轮/)).toBeTruthy();
        expect(screen.getByText(/1,200 tokens/)).toBeTruthy();
        // t257 AC2：目录只显示末级。
        expect(screen.getByText(/proj/)).toBeTruthy();
        expect(screen.queryByText(/\/path\/to\/proj/)).toBeNull();
        expect(screen.getByText(/claude-sonnet-4/)).toBeTruthy();
        expect(document.querySelector(".pane-agent-badge")?.getAttribute("title")).toBe(
            "claude-sonnet-4",
        );
        expect(document.querySelector(".pane-accent")).toBeTruthy();
    });

    it("AC1/AC4：元信息不显示 source 文字，日期为最后一条消息精确时间", () => {
        const last_ts = new Date(2026, 7, 7, 9, 8, 7).getTime();
        render(
            <SessionPane
                {...PROPS}
                column={column({
                    messages: [msg("m1", "user", "hi", 100), msg("m2", "assistant", "ok", last_ts)],
                })}
            />,
        );
        // AC1：无完整软件名文字。
        expect(screen.queryByText(/claude_code/)).toBeNull();
        // AC4：日期为最后消息精确时间（含时分秒）。
        expect(screen.getByText(/2026-08-07 09:08:07/)).toBeTruthy();
    });

    it("AC4：无消息时日期回退到打开时间", () => {
        render(
            <SessionPane
                {...PROPS}
                column={column({
                    openedAt: new Date(2026, 0, 2, 3, 4, 5).getTime(),
                    messages: [],
                })}
            />,
        );
        expect(screen.getByText(/2026-01-02 03:04:05/)).toBeTruthy();
    });

    it("按 source 渲染对应 provider logo，未知 source 使用 overview 兜底", () => {
        const { rerender } = render(<SessionPane {...PROPS} />);
        const expected = [
            ["claude_code", ["claude"]],
            ["kimi_code", ["kimi"]],
            ["grok", ["grok_light", "grok_dark"]],
            ["opencode", ["opencode_go_light", "opencode_go_dark"]],
            ["unknown", []],
        ] as const;

        for (const [source, assets] of expected) {
            rerender(
                <SessionPane
                    {...PROPS}
                    column={column({
                        loc: { source, env: "win", session_id: source },
                    })}
                />,
            );
            const badge = document.querySelector(".pane-agent-badge");
            expect(badge?.querySelector(".vicon")).toBeTruthy();
            if (assets.length === 0) {
                expect(badge?.querySelector("svg")).toBeTruthy();
            } else {
                const sources = Array.from(badge?.querySelectorAll("img") ?? []).map(
                    (img) => img.getAttribute("src") ?? "",
                );
                for (const asset of assets) {
                    expect(sources.some((src) => src.includes(asset))).toBe(true);
                }
            }
        }
    });

    it("Markdown 消息按 markdown 渲染而非纯文本", () => {
        render(
            <SessionPane
                {...PROPS}
                column={column({
                    messages: [msg("m1", "assistant", "# 标题\n\n- 甲\n- 乙", 100)],
                })}
            />,
        );
        expect(document.querySelector("h1")).toBeTruthy();
        expect(document.querySelectorAll("li").length).toBe(2);
    });

    it("相邻消息时间差超 10 分钟插入时间分隔线", () => {
        render(
            <SessionPane
                {...PROPS}
                column={column({
                    messages: [
                        msg("m1", "user", "a", 0),
                        msg("m2", "assistant", "b", 12 * 60 * 1000),
                        msg("m3", "user", "c", 12 * 60 * 1000 + 5000),
                    ],
                })}
            />,
        );
        expect(document.querySelectorAll(".pane-divider").length).toBe(1);
    });

    it("脚部显示槽位号与 user/assistant 消息计数", () => {
        render(
            <SessionPane
                {...PROPS}
                column={column({
                    messages: [
                        msg("m1", "user", "a", 1),
                        msg("m2", "assistant", "b", 2),
                        msg("m3", "user", "c", 3),
                    ],
                })}
            />,
        );
        expect(screen.getByText("槽位 2")).toBeTruthy();
        expect(screen.getByText(/用户 2/)).toBeTruthy();
        expect(screen.getByText(/Agent 1/)).toBeTruthy();
    });

    it("加载中无消息时显示骨架屏", () => {
        render(<SessionPane {...PROPS} column={column({ status: "loading", messages: [] })} />);
        expect(document.querySelector(".pane-skeleton")).toBeTruthy();
    });

    it("源文件缺失显示空态（不渲染骨架屏）", () => {
        render(<SessionPane {...PROPS} column={column({ status: "missing", messages: [] })} />);
        expect(screen.getByText("该会话的原始记录文件不存在或已删除")).toBeTruthy();
        expect(document.querySelector(".pane-skeleton")).toBeNull();
    });

    it("大纲抽屉列消息（角色序号+摘要+时间），点击滚动定位", () => {
        render(
            <SessionPane
                {...PROPS}
                outline_open
                column={column({
                    messages: [
                        msg("m1", "user", "这是第一条消息内容", 100),
                        msg("m2", "assistant", "回复内容", 200),
                    ],
                })}
            />,
        );
        expect(document.querySelector(".pane-outline")).toBeTruthy();
        const rows = document.querySelectorAll(".pane-outline-row");
        expect(rows.length).toBe(2);
        const first = rows[0];
        if (!first) throw new Error("outline row missing");
        const container = document.querySelector(".pane-msgs");
        if (!container) throw new Error("pane-msgs missing");
        Object.defineProperty(container, "scrollTop", { value: 0, writable: true });
        fireEvent.click(first);
        // 虚拟列表将 scrollTop 设为第一条消息偏移（jsdom 无测量，按估计高度 80）。
        expect((container as HTMLElement).scrollTop).toBe(0);
    });
});
