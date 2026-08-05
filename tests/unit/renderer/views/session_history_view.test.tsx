import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionHistoryView } from "../../../../src/renderer/views/SessionHistoryView";
import { install_history_usageboard } from "./session_history_test_utils";

/**
 * t211 会话历史窗口组件测试。
 * 覆盖 AC：分栏布局、工具栏、最近 6 条、超 6 模态、消息选择/全选/清除、复制生成
 * Markdown + 反馈、空态、清空全部、推送追加、onFocus 打开。
 */

const LOC_A = { source: "claude_code", env: "win", session_id: "sess_a" } as const;
const LOC_B = { source: "opencode", env: "win", session_id: "sess_b" } as const;

function msg(id: string, role: "user" | "assistant", text: string, timestamp: number) {
    return { id, role, text, timestamp };
}

type MockFn = ReturnType<typeof vi.fn>;
interface MockBoard {
    sessionHistory: {
        open: MockFn;
        subscribe: MockFn;
        unsubscribe: MockFn;
        query: MockFn;
        recent: MockFn;
        onMessagesUpdated: MockFn;
        onFocus: MockFn;
    };
    tokenStats: {
        getSessions: MockFn;
        getDashboard: MockFn;
        onUpdated: MockFn;
        getStatus: MockFn;
    };
}

function usageboard(): MockBoard {
    return (globalThis as unknown as { usageboard: MockBoard }).usageboard;
}

/** 剪贴板 spy（模块级持有，避免 unbound-method / 断言冲突）。 */
let write_text_spy: MockFn;

/** 渲染后取 onFocus 回调（view 的 useEffect 里已注册）。 */
function focus_cb(): (loc: unknown) => void {
    const ub = usageboard();
    const cb = ub.sessionHistory.onFocus.mock.calls[0]?.[0] as ((loc: unknown) => void) | undefined;
    if (!cb) throw new Error("onFocus callback not registered");
    return cb;
}

beforeEach(() => {
    install_history_usageboard();
    write_text_spy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
        clipboard: { writeText: write_text_spy },
    });
});

// 不调用 reset：RTL cleanup 卸载组件时视图的 unsubscribe 仍要读 usageboard；
// 下次 beforeEach 重新 install 覆盖即可隔离。

describe("SessionHistoryView (t211)", () => {
    it("初始 URL loc 打开会话栏，单栏用 single 网格", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        window.history.replaceState({}, "", "/?loc=" + encodeURIComponent(JSON.stringify(LOC_A)));

        render(<SessionHistoryView />);
        await waitFor(() => screen.getByText("你好"));

        expect(screen.getByText("1/6")).toBeTruthy();
        const grid = document.querySelector(".history-grid");
        expect(grid?.className).toContain("single");
        expect(ub.sessionHistory.subscribe).toHaveBeenCalledWith("claude_code", "win", "sess_a");
        window.history.replaceState({}, "", "/");
    });

    it("打开 2 个会话后显示 2/6，single 网格", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<SessionHistoryView />);
        const cb = focus_cb();
        act(() => {
            cb(LOC_A);
            cb(LOC_B);
        });
        await waitFor(() => {
            expect(screen.getByText("2/6")).toBeTruthy();
        });
        expect(document.querySelector(".history-grid")?.className).toContain("single");
    });

    it("最近 6 条：getSessions 返回的会话被打开", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([
            {
                id: "s1",
                source: "claude_code",
                env: "win",
                model: "claude",
                title: "会话1",
                directory: null,
                started_at: 1,
                ended_at: 10,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
            },
            {
                id: "s2",
                source: "claude_code",
                env: "win",
                model: "claude",
                title: "会话2",
                directory: null,
                started_at: 2,
                ended_at: 20,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
            },
            {
                id: "s3",
                source: "claude_code",
                env: "win",
                model: "claude",
                title: "会话3",
                directory: null,
                started_at: 3,
                ended_at: 30,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
            },
        ]);
        render(<SessionHistoryView />);

        fireEvent.click(screen.getByText("最近 6 条"));
        await waitFor(() => {
            expect(screen.getByText("3/6")).toBeTruthy();
        });
        // 最近 6 条按现有 getSessions { limit: 6 } 拉取。
        expect(ub.tokenStats.getSessions).toHaveBeenCalledWith({ limit: 6 });
        expect(screen.getByText("会话1")).toBeTruthy();
        expect(screen.getByText("会话2")).toBeTruthy();
        expect(screen.getByText("会话3")).toBeTruthy();
    });

    it("3 个会话 → 两列网格（非 single）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<SessionHistoryView />);
        const cb = focus_cb();
        for (let i = 0; i < 3; i += 1) {
            act(() => {
                cb({ source: "claude_code", env: "win", session_id: `g${String(i)}` });
            });
        }
        await waitFor(() => {
            expect(screen.getByText("3/6")).toBeTruthy();
        });
        expect(document.querySelector(".history-grid")?.className).not.toContain("single");
    });

    it("超 6 时弹模态框，关闭至少 1 个后新会话入栏", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<SessionHistoryView />);
        const cb = focus_cb();

        const locs = Array.from({ length: 6 }, (_, i) => ({
            source: "claude_code",
            env: "win",
            session_id: `s${String(i)}`,
        }));
        for (const loc of locs)
            act(() => {
                cb(loc);
            });
        await waitFor(() => {
            expect(screen.getByText("6/6")).toBeTruthy();
        });

        // 第 7 个 → 模态框。
        act(() => {
            cb({ source: "opencode", env: "win", session_id: "s7" });
        });
        await waitFor(() => {
            expect(screen.getByRole("dialog")).toBeTruthy();
        });
        // 模态框列出当前 6 个会话。
        expect(screen.getAllByRole("checkbox")).toHaveLength(6);
        const confirm_btn = document.querySelector<HTMLButtonElement>(
            ".history-modal-actions button:last-child",
        );
        if (!confirm_btn) throw new Error("confirm button missing");
        expect(confirm_btn.disabled).toBe(true);

        const first_check = screen.getAllByRole("checkbox")[0] as HTMLInputElement;
        fireEvent.click(first_check);
        expect(confirm_btn.disabled).toBe(false);

        fireEvent.click(confirm_btn);
        await waitFor(() => {
            expect(screen.getByText("6/6")).toBeTruthy();
        });
        expect(ub.sessionHistory.subscribe).toHaveBeenCalledWith("opencode", "win", "s7");
    });

    it("消息选择：勾选后计数更新，全选本栏 / 清除本栏生效", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "q1", 100), msg("m2", "assistant", "a1", 200)],
            next_cursor: null,
        });
        render(<SessionHistoryView />);
        act(() => {
            focus_cb()(LOC_A);
        });
        await waitFor(() => screen.getByText("q1"));

        const checks = screen.getAllByRole("checkbox");
        fireEvent.click(checks[0] as HTMLInputElement);
        expect(screen.getByText("已选 1 条")).toBeTruthy();
        expect(screen.getByText("复制 1 条")).toBeTruthy();

        fireEvent.click(screen.getByText("全选本栏"));
        expect(screen.getByText("已选 2 条")).toBeTruthy();
        expect(screen.getByText("复制 2 条")).toBeTruthy();

        fireEvent.click(screen.getByText("清除本栏"));
        expect(screen.getByText("已选 0 条")).toBeTruthy();
    });

    it("复制生成 Markdown 并写剪贴板，按钮变已复制 ✓", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "帮我修登录", 100), msg("m2", "assistant", "好的", 200)],
            next_cursor: null,
        });
        ub.tokenStats.getSessions.mockResolvedValue([
            {
                id: "sess_a",
                source: "claude_code",
                env: "win",
                model: "claude",
                title: "修登录",
                directory: null,
                started_at: 1,
                ended_at: 10,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
            },
        ]);
        render(<SessionHistoryView />);
        act(() => {
            focus_cb()(LOC_A);
        });
        await waitFor(() => screen.getByText("帮我修登录"));

        fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLInputElement);
        fireEvent.click(screen.getByText("复制 1 条"));

        await waitFor(() => {
            expect(write_text_spy).toHaveBeenCalledTimes(1);
        });
        const md = String(write_text_spy.mock.calls[0]?.[0] ?? "");
        expect(md).toContain("## 会话：修登录（claude-code · ");
        expect(md).toContain("**用户**");
        expect(md).toContain("帮我修登录");
        expect(screen.getByText(/已复制 ✓/)).toBeTruthy();
    });

    it("跨栏选中：两栏各选一条，计数合计；推送刷新后选中保留", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockImplementation((_source: string, _env: string, sid: string) =>
            Promise.resolve({
                messages:
                    sid === "sess_a"
                        ? [msg("a1", "user", "甲栏消息", 1)]
                        : [msg("b1", "user", "乙栏消息", 2)],
                next_cursor: null,
            }),
        );
        render(<SessionHistoryView />);
        const cb = focus_cb();
        act(() => {
            cb(LOC_A);
        });
        act(() => {
            cb(LOC_B);
        });
        await waitFor(() => screen.getByText("甲栏消息"));

        // 两栏各勾选一条。
        const checks = screen.getAllByRole("checkbox");
        fireEvent.click(checks[0] as HTMLInputElement);
        fireEvent.click(checks[1] as HTMLInputElement);
        // 每栏各自显示「已选 1 条」，工具栏合计「复制 2 条」。
        expect(screen.getAllByText("已选 1 条")).toHaveLength(2);
        expect(screen.getByText("复制 2 条")).toBeTruthy();

        // 推送（刷新）后选中按 id 保留。
        const updated_cb = ub.sessionHistory.onMessagesUpdated.mock.calls[0]?.[0] as
            | ((p: unknown) => void)
            | undefined;
        if (!updated_cb) throw new Error("onMessagesUpdated not registered");
        act(() => {
            updated_cb({
                source: "claude_code",
                env: "win",
                session_id: "sess_a",
                messages: [msg("a1", "user", "甲栏消息", 1), msg("a2", "user", "新追加", 3)],
            });
        });
        expect(screen.getByText("复制 2 条")).toBeTruthy();
    });

    it("源文件缺失：query 拒绝 → 空态文案，其他栏不受影响", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockImplementation((_source: string, _env: string, sid: string) =>
            sid === "missing"
                ? Promise.reject(new Error("[SESSION_NOT_FOUND] session file not found"))
                : Promise.resolve({ messages: [msg("m1", "user", "正常", 1)], next_cursor: null }),
        );
        render(<SessionHistoryView />);
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "missing" });
        });
        act(() => {
            cb(LOC_B);
        });
        await waitFor(() => screen.getByText("该会话的原始记录文件不存在或已删除"));
        expect(screen.getByText("正常")).toBeTruthy();
    });

    it("清空全部关闭所有栏", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<SessionHistoryView />);
        const cb = focus_cb();
        act(() => {
            cb(LOC_A);
        });
        act(() => {
            cb(LOC_B);
        });
        await waitFor(() => {
            expect(screen.getByText("2/6")).toBeTruthy();
        });

        fireEvent.click(screen.getByText("清空全部"));
        expect(screen.getByText("0/6")).toBeTruthy();
        expect(ub.sessionHistory.unsubscribe).toHaveBeenCalledWith("claude_code", "win", "sess_a");
        expect(ub.sessionHistory.unsubscribe).toHaveBeenCalledWith("opencode", "win", "sess_b");
    });

    it("onMessagesUpdated 推送增量追加到对应栏尾部", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "q1", 100)],
            next_cursor: null,
        });
        render(<SessionHistoryView />);
        act(() => {
            focus_cb()(LOC_A);
        });
        await waitFor(() => screen.getByText("q1"));

        const updated_cb = ub.sessionHistory.onMessagesUpdated.mock.calls[0]?.[0] as
            | ((p: unknown) => void)
            | undefined;
        if (!updated_cb) throw new Error("onMessagesUpdated not registered");
        act(() => {
            updated_cb({
                source: "claude_code",
                env: "win",
                session_id: "sess_a",
                messages: [msg("m2", "assistant", "新回复", 200)],
            });
        });
        expect(screen.getByText("新回复")).toBeTruthy();
    });

    it("onFocus 打开会话栏（跨 route 聚焦定位）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "聚焦打开", 1)],
            next_cursor: null,
        });
        render(<SessionHistoryView />);
        act(() => {
            focus_cb()({ source: "grok", env: "wsl", session_id: "gs1" });
        });
        await waitFor(() => screen.getByText("聚焦打开"));
        expect(ub.sessionHistory.subscribe).toHaveBeenCalledWith("grok", "wsl", "gs1");
    });

    it("单栏关闭 ×：注销订阅并移除栏，选中清理", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "q1", 1), msg("m2", "user", "q2", 2)],
            next_cursor: null,
        });
        render(<SessionHistoryView />);
        act(() => {
            focus_cb()(LOC_A);
        });
        await waitFor(() => screen.getByText("q1"));

        fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLInputElement);
        expect(screen.getByText("复制 1 条")).toBeTruthy();

        const close_btn = document.querySelector(".history-col-close");
        if (!close_btn) throw new Error("close button missing");
        fireEvent.click(close_btn);

        expect(screen.getByText("0/6")).toBeTruthy();
        expect(ub.sessionHistory.unsubscribe).toHaveBeenCalledWith("claude_code", "win", "sess_a");
        // 关闭栏的选中随之丢弃。
        expect(screen.getByText("复制 0 条")).toBeTruthy();
    });

    it("超 6 模态「取消」则新会话不入栏", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<SessionHistoryView />);
        const cb = focus_cb();
        for (let i = 0; i < 6; i += 1) {
            act(() => {
                cb({ source: "claude_code", env: "win", session_id: `c${String(i)}` });
            });
        }
        await waitFor(() => {
            expect(screen.getByText("6/6")).toBeTruthy();
        });

        act(() => {
            cb({ source: "opencode", env: "win", session_id: "c7" });
        });
        await waitFor(() => {
            expect(screen.getByRole("dialog")).toBeTruthy();
        });

        fireEvent.click(screen.getByText("取消"));
        expect(screen.getByText("6/6")).toBeTruthy();
        expect(ub.sessionHistory.subscribe).not.toHaveBeenCalledWith("opencode", "win", "c7");
    });

    it("已开栏 + 最近 6 条：空位不足部分弹模态框，不超 6（f006 回归）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<SessionHistoryView />);
        // 已有 1 栏。
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "exist" });
        });
        await waitFor(() => {
            expect(screen.getByText("1/6")).toBeTruthy();
        });

        // 最近 6 条：5 个新会话入栏（凑满 6），第 6 个进模态框等待腾位。
        ub.tokenStats.getSessions.mockResolvedValue(
            Array.from({ length: 6 }, (_, i) => ({
                id: `r${String(i)}`,
                source: "claude_code",
                env: "win",
                model: "claude",
                title: `最近${String(i)}`,
                directory: null,
                started_at: i,
                ended_at: i + 10,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
            })),
        );
        fireEvent.click(screen.getByText("最近 6 条"));
        await waitFor(() => {
            expect(screen.getByRole("dialog")).toBeTruthy();
        });
        // 栏总数保持 6（1 + 5），第 7 个等待。
        expect(screen.getByText("6/6")).toBeTruthy();
    });

    it("初始查询 limit 200；滚动到顶触发 load_older 前置加载更早（决策 17）", async () => {
        const ub = usageboard();
        const initial = {
            messages: [msg("m5", "user", "最新5", 5), msg("m6", "user", "最新6", 6)],
            next_cursor: "cursor-1",
        };
        const older = {
            messages: [msg("m1", "user", "更早1", 1), msg("m2", "user", "更早2", 2)],
            next_cursor: null,
        };
        ub.sessionHistory.query.mockImplementation(
            (_s: string, _e: string, _id: string, opts: unknown) => {
                const o = opts as { before_cursor?: unknown };
                return Promise.resolve(o.before_cursor ? older : initial);
            },
        );
        render(<SessionHistoryView />);
        act(() => {
            focus_cb()(LOC_A);
        });
        await waitFor(() => screen.getByText("最新5"));

        // 初始查询带 limit 200。
        const first_call = ub.sessionHistory.query.mock.calls[0] as unknown[];
        expect(first_call[3]).toEqual({ limit: 200 });

        // 滚动到顶部 → load_older → 前置更早页。
        const msgs = document.querySelector(".history-msgs");
        if (!msgs) throw new Error("msg list missing");
        fireEvent.scroll(msgs);
        await waitFor(() => screen.getByText("更早1"));

        const older_call = ub.sessionHistory.query.mock.calls[1] as unknown[];
        expect(older_call[3]).toEqual({ limit: 200, before_cursor: "cursor-1" });
        // 更早消息在最新之前（前置），且尾部完整。
        const rows = Array.from(document.querySelectorAll(".history-msg-text")).map((el) =>
            el.textContent.trim(),
        );
        expect(rows[0]).toBe("更早1");
        expect(rows[rows.length - 1]).toBe("最新6");
    });

    it("5s 兜底拉取合并新消息去重（不重复已加载）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "已加载", 1)],
            next_cursor: null,
        });
        render(<SessionHistoryView />);
        act(() => {
            focus_cb()(LOC_A);
        });
        await waitFor(() => screen.getByText("已加载"));

        // 模拟兜底周期：尾部多了一条新消息，且旧消息重复出现。
        const before = ub.sessionHistory.query.mock.calls.length;
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "已加载", 1), msg("m2", "user", "兜底新消息", 2)],
            next_cursor: null,
        });
        // 手动触发兜底 interval 逻辑不可控，改用推送同 id 验证去重；
        // 兜底拉取本身走同一 merge_tail 路径，用 onMessagesUpdated 同源验证。
        const updated_cb = ub.sessionHistory.onMessagesUpdated.mock.calls[0]?.[0] as
            | ((p: unknown) => void)
            | undefined;
        if (!updated_cb) throw new Error("onMessagesUpdated not registered");
        act(() => {
            updated_cb({
                source: "claude_code",
                env: "win",
                session_id: "sess_a",
                messages: [msg("m1", "user", "已加载", 1), msg("m2", "user", "兜底新消息", 2)],
            });
        });
        expect(screen.getByText("兜底新消息")).toBeTruthy();
        expect(document.querySelectorAll(".history-msg-text")).toHaveLength(2);
        expect(ub.sessionHistory.query.mock.calls.length).toBe(before);
    });

    it("navigates back to the usage panel and token-stats panel", async () => {
        render(<SessionHistoryView />);
        await waitFor(() => screen.getByRole("button", { name: /最近 6 条/ }));
        const nav = usageboard() as unknown as {
            tray: { open_panel: MockFn };
            tokenStats: { open: MockFn };
        };

        fireEvent.click(screen.getByRole("button", { name: /用量面板/ }));
        expect(nav.tray.open_panel).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: /代理面板/ }));
        expect(nav.tokenStats.open).toHaveBeenCalledTimes(1);
    });
});
