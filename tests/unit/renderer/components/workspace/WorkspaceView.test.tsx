import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceView } from "../../../../../src/renderer/components/workspace/WorkspaceView";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * t224 工作台槽位模型测试（取代 t211 6 栏模型语义）。
 * 覆盖：槽位装入/移除/换位、超位 toast、布局切换、入口重接（onFocus/URL loc）、
 * 消息推送追加、选择与复制、全空空态、最近会话替换全部、picker 弹窗。
 */

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
        open: MockFn;
        getSessions: MockFn;
        getDashboard: MockFn;
        onUpdated: MockFn;
        getStatus: MockFn;
    };
    tray: { open_panel: MockFn };
}

function usageboard(): MockBoard {
    return (globalThis as unknown as { usageboard: MockBoard }).usageboard;
}

function focus_cb(): (loc: unknown) => void {
    const ub = usageboard();
    const cb = ub.sessionHistory.onFocus.mock.calls[0]?.[0] as ((loc: unknown) => void) | undefined;
    if (!cb) throw new Error("onFocus callback not registered");
    return cb;
}

function messages_cb(): (payload: unknown) => void {
    const ub = usageboard();
    const cb = ub.sessionHistory.onMessagesUpdated.mock.calls[0]?.[0] as
        | ((payload: unknown) => void)
        | undefined;
    if (!cb) throw new Error("onMessagesUpdated callback not registered");
    return cb;
}

function msg(id: string, role: "user" | "assistant", text: string, timestamp: number) {
    return { id, role, text, timestamp };
}

function ts_sess(
    id: string,
    source: string,
    opts: { title?: string | null; ended_at?: number } = {},
) {
    return {
        id,
        source,
        env: "win",
        model: "model",
        title: opts.title ?? `会话 ${id}`,
        directory: null,
        input_tokens: 100,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_write_tokens: 25,
        calls: 3,
        started_at: 1000,
        ended_at: opts.ended_at ?? 2000,
    };
}

beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    install_history_usageboard();
});

describe("WorkspaceView (t224)", () => {
    it("全空空态：无槽位占用时显示引导，含去会话库/打开最近会话入口", () => {
        render(<WorkspaceView />);
        expect(screen.getByText("工作台为空")).toBeTruthy();
        expect(screen.getByText("打开最近会话")).toBeTruthy();
        expect(screen.getByText("去会话库")).toBeTruthy();
    });

    it("onFocus 打开会话装入槽位，rail 显示元数据", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([ts_sess("sess_a", "claude_code")]);
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(screen.getAllByText("会话 sess_a").length).toBeGreaterThan(0);
        });
        expect(screen.getByText(/3 轮/)).toBeTruthy();
        expect(screen.getByText(/375 tokens/)).toBeTruthy();
        expect(screen.getByText("1/8")).toBeTruthy();
    });

    it("重复打开同一会话不重复装入槽位", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(screen.getByText("1/8")).toBeTruthy();
        });
    });

    it("URL loc 初始定位装入槽位", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        window.history.replaceState(
            {},
            "",
            "/?loc=" +
                encodeURIComponent(
                    JSON.stringify({ source: "grok", env: "win", session_id: "sess_g" }),
                ),
        );
        render(<WorkspaceView />);
        await waitFor(() => {
            expect(screen.getByText("1/8")).toBeTruthy();
        });
        window.history.replaceState({}, "", "/");
    });

    it("布局切换器在 1/2/3/4/6/8 间切换", () => {
        render(<WorkspaceView />);
        for (const n of [1, 2, 3, 4, 6, 8]) {
            fireEvent.click(screen.getByRole("button", { name: `布局 ${String(n)}` }));
            expect(screen.getByRole("button", { name: `布局 ${String(n)}` }).className).toContain(
                "on",
            );
        }
    });

    it("消息推送追加到槽位（不回归）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));

        // 推送重复 id（去重分支）+ 新 id（追加），列表不重复（f007）。
        act(() => {
            messages_cb()({
                source: "claude_code",
                env: "win",
                session_id: "sess_a",
                messages: [msg("m1", "user", "你好", 100), msg("m2", "assistant", "收到", 200)],
            });
        });
        expect(screen.getByText("收到")).toBeTruthy();
        expect(screen.getAllByText("你好")).toHaveLength(1);
    });

    it("关闭槽位移除会话并退订", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(screen.getByText("1/8")).toBeTruthy();
        });
        fireEvent.click(screen.getByLabelText("关闭会话"));
        expect(ub.sessionHistory.unsubscribe).toHaveBeenCalledWith("claude_code", "win", "sess_a");
        await waitFor(() => {
            expect(screen.getByText("工作台为空")).toBeTruthy();
        });
    });

    it("消息选择与复制生成 Markdown", async () => {
        const ub = usageboard();
        const write_spy = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText: write_spy } });
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));
        fireEvent.click(screen.getByRole("button", { name: "全选本栏" }));
        fireEvent.click(screen.getByText(/复制 1 条/));
        await waitFor(() => {
            expect(write_spy).toHaveBeenCalled();
        });
    });

    it("清空按钮退订全部并回到空态", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
            focus_cb()({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(screen.getByText("2/8")).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: "清空" }));
        await waitFor(() => {
            expect(screen.getByText("工作台为空")).toBeTruthy();
        });
    });

    it("最近会话：快捷选择 + 清空替换全部槽位", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([
            ts_sess("s1", "claude_code", { ended_at: 3000 }),
            ts_sess("s2", "opencode", { ended_at: 2000 }),
            ts_sess("s3", "grok", { ended_at: 1000 }),
        ]);
        render(<WorkspaceView />);
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => {
            expect(screen.getByText("最近 2 个")).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: "最近 2 个" }));
        fireEvent.click(screen.getByRole("button", { name: "清空并替换全部槽位" }));
        await waitFor(() => {
            expect(screen.getByText("2/8")).toBeTruthy();
        });
    });

    it("会话选择弹窗：点空槽打开、点会话装入目标槽位", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([ts_sess("s1", "claude_code")]);
        render(<WorkspaceView />);
        fireEvent.click(screen.getByLabelText("槽位 1（空）"));
        await waitFor(() => {
            expect(screen.getByRole("dialog", { name: "选择会话" })).toBeTruthy();
        });
        fireEvent.click(screen.getByText("会话 s1"));
        await waitFor(() => {
            expect(screen.getByText("1/8")).toBeTruthy();
        });
    });

    it("rail 拖拽换位顺序同步网格", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(screen.getByText("2/8")).toBeTruthy();
        });
        await waitFor(() => {
            expect([...document.querySelectorAll(".rail-title")].length).toBe(2);
        });
        const titles_before = [...document.querySelectorAll(".rail-title")].map(
            (el) => el.textContent,
        );
        const a_slot = [...document.querySelectorAll<HTMLElement>(".rail-slot")].find((el) =>
            el.textContent.includes("sess_a"),
        );
        const b_slot = [...document.querySelectorAll<HTMLElement>(".rail-slot")].find((el) =>
            el.textContent.includes("sess_b"),
        );
        if (!a_slot || !b_slot) throw new Error("rail slots not found");
        fireEvent.dragStart(a_slot);
        fireEvent.drop(b_slot);
        await waitFor(() => {
            const titles = [...document.querySelectorAll(".rail-title")].map(
                (el) => el.textContent,
            );
            expect(titles).not.toEqual(titles_before);
        });
        const titles_after = [...document.querySelectorAll(".rail-title")].map(
            (el) => el.textContent,
        );
        expect(titles_after[0]).toBe("sess_b");
        expect(titles_after[1]).toBe("sess_a");
    });

    it("槽位全满后 onFocus 新会话 toast 拒绝", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            for (let i = 0; i < 8; i += 1) {
                cb({ source: "claude_code", env: "win", session_id: `s${String(i)}` });
            }
        });
        await waitFor(() => {
            expect(screen.getByText("8/8")).toBeTruthy();
        });
        act(() => {
            cb({ source: "grok", env: "win", session_id: "overflow" });
        });
        expect(screen.getByText("槽位已满（最多 8 个）")).toBeTruthy();
    });

    it("历史分页：初始 limit 200，滚动到顶 load_older 前置更早消息", async () => {
        const ub = usageboard();
        ub.sessionHistory.query
            .mockResolvedValueOnce({
                messages: [msg("m1", "user", "你好", 100)],
                next_cursor: "c1",
            })
            .mockResolvedValueOnce({ messages: [msg("m0", "user", "更早", 0)], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));
        expect(ub.sessionHistory.query).toHaveBeenCalledWith("claude_code", "win", "sess_a", {
            limit: 200,
        });
        const msgs = document.querySelector(".history-msgs");
        if (!(msgs instanceof HTMLElement)) throw new Error("history-msgs not found");
        fireEvent.scroll(msgs);
        await waitFor(() => {
            expect(ub.sessionHistory.query).toHaveBeenCalledWith("claude_code", "win", "sess_a", {
                limit: 200,
                before_cursor: "c1",
            });
        });
        await waitFor(() => screen.getByText("更早"));
        expect(screen.getByText("你好")).toBeTruthy();
        // 更早消息前置在尾部消息之前（f008 DOM 顺序）。
        const earlier_el = screen.getByText("更早");
        const tail_el = screen.getByText("你好");
        expect(earlier_el.compareDocumentPosition(tail_el) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
    });

    it("picker：搜索过滤、agent 筛选带计数、已打开标记", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([
            ts_sess("s1", "claude_code", { title: "会话一" }),
            ts_sess("s2", "opencode", { title: "会话二" }),
            ts_sess("s3", "grok", { title: "会话三" }),
        ]);
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "s1" });
        });
        await waitFor(() => screen.getByText("1/8"));
        fireEvent.click(screen.getByRole("button", { name: "槽位 2（空）" }));
        await waitFor(() => screen.getByRole("dialog", { name: "选择会话" }));
        expect(screen.getByText("全部 3")).toBeTruthy();
        expect(screen.getByText("Claude 1")).toBeTruthy();
        expect(screen.getByText("已打开")).toBeTruthy();

        const picker_titles = () =>
            [...document.querySelectorAll(".ws-picker-title")].map((el) => el.textContent);
        expect(picker_titles()).toEqual(["会话一已打开", "会话二", "会话三"]);

        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "会话二" } });
        expect(picker_titles()).toEqual(["会话二"]);
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "" } });

        fireEvent.click(screen.getByRole("button", { name: /^OpenCode/ }));
        expect(picker_titles()).toEqual(["会话二"]);
    });

    it("recent：按日期倒序、上限 8、顺序角标、未选时确认 disabled", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([
            ts_sess("old", "claude_code", { ended_at: 1000 }),
            ts_sess("mid", "opencode", { ended_at: 2000 }),
            ts_sess("new", "grok", { ended_at: 3000 }),
        ]);
        render(<WorkspaceView />);
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => screen.getByRole("dialog", { name: "最近会话" }));
        const titles = [...document.querySelectorAll(".ws-recent-title")].map(
            (el) => el.textContent,
        );
        expect(titles).toEqual(["会话 new", "会话 mid", "会话 old"]);

        const confirm_btn = screen.getByRole("button", { name: "清空并替换全部槽位" });
        expect((confirm_btn as HTMLButtonElement).disabled).toBe(true);

        const rows = [...document.querySelectorAll<HTMLElement>(".ws-recent-row")];
        const first = rows[0];
        const second = rows[1];
        if (!first || !second) throw new Error("recent rows missing");
        fireEvent.click(first);
        fireEvent.click(second);
        expect(screen.getByText(/选 2\/8/)).toBeTruthy();
        expect(
            [...document.querySelectorAll(".ws-recent-check")].map((el) => el.textContent),
        ).toEqual(["1", "2", ""]);
    });

    it("recent：选择第 9 个被拒（上限 8）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        const list = Array.from({ length: 9 }, (_, i) =>
            ts_sess(`s${String(i)}`, "claude_code", { ended_at: 9000 - i }),
        );
        ub.tokenStats.getSessions.mockResolvedValue(list);
        render(<WorkspaceView />);
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => screen.getByRole("dialog", { name: "最近会话" }));
        const rows = [...document.querySelectorAll<HTMLElement>(".ws-recent-row")];
        for (const row of rows) {
            fireEvent.click(row);
        }
        expect(document.querySelectorAll(".ws-recent-check.on").length).toBe(8);
        expect(screen.getByText(/选 8\/8/)).toBeTruthy();
    });

    it("清除本栏与跨槽位选中计数合计", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(screen.getAllByText("你好").length).toBe(2);
        });
        const select_all = screen.getAllByRole("button", { name: "全选本栏" });
        const sa0 = select_all[0];
        const sa1 = select_all[1];
        if (!sa0 || !sa1) throw new Error("select-all buttons missing");
        fireEvent.click(sa0);
        fireEvent.click(sa1);
        expect(screen.getByText("复制 2 条")).toBeTruthy();
        const clear_buttons = screen.getAllByRole("button", { name: "清除本栏" });
        if (!clear_buttons[0]) throw new Error("clear button missing");
        fireEvent.click(clear_buttons[0]);
        expect(screen.getByText("复制 1 条")).toBeTruthy();
    });

    it("rail 可折叠/展开", () => {
        render(<WorkspaceView />);
        expect(document.querySelector(".session-rail")?.className).not.toContain("collapsed");
        fireEvent.click(screen.getByRole("button", { name: "折叠槽位栏" }));
        expect(document.querySelector(".session-rail")?.className).toContain("collapsed");
        fireEvent.click(screen.getByRole("button", { name: "展开槽位栏" }));
        expect(document.querySelector(".session-rail")?.className).not.toContain("collapsed");
    });

    it("布局切换联动网格列数（--cols）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => screen.getByText("2/8"));
        fireEvent.click(screen.getByRole("button", { name: "布局 4" }));
        expect(document.querySelector(".slot-grid")?.getAttribute("style")).toContain("--cols: 2");
        fireEvent.click(screen.getByRole("button", { name: "布局 8" }));
        expect(document.querySelector(".slot-grid")?.getAttribute("style")).toContain("--cols: 2");
    });
});
