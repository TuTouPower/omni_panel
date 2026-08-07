import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceView } from "../../../../../src/renderer/components/workspace/WorkspaceView";
import {
    reset_selection_store,
    selection_store,
} from "../../../../../src/renderer/lib/workspace/selection-store";
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
    reset_selection_store();
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
        const rail_sub = document.querySelector(".rail-sub");
        expect(rail_sub?.textContent).toContain("3 轮");
        expect(rail_sub?.textContent).toContain("375 tokens");
        expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
        });
        window.history.replaceState({}, "", "/");
    });

    it("工作台工具条移除数字布局按钮与会话计数，保留主要操作入口", () => {
        render(<WorkspaceView />);
        const toolbar = document.querySelector(".workspace-toolbar");
        expect(toolbar).toBeTruthy();
        expect(toolbar?.querySelector(".ws-layout-switch")).toBeNull();
        expect(toolbar?.querySelector(".ws-count")).toBeNull();
        for (const n of [1, 2, 3, 4, 6, 8]) {
            expect(screen.queryByRole("button", { name: `布局 ${String(n)}` })).toBeNull();
        }
        expect(screen.getByRole("button", { name: "最近会话" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "清空" })).toBeTruthy();
        expect(screen.getByRole("button", { name: /视图/ })).toBeTruthy();
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
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
        fireEvent.click(screen.getByRole("button", { name: "全选可见" }));
        // 选中后托盘展开，点托盘「复制」写剪贴板（t226 取代旧工具栏复制）。
        await waitFor(() => {
            expect(document.querySelector(".selection-tray")?.className).toContain("expanded");
        });
        fireEvent.click(screen.getByRole("button", { name: "复制" }));
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(2);
        });
        const clear_btn0 = screen.getAllByRole("button", { name: "清空" })[0];
        if (!clear_btn0) throw new Error("清空按钮缺失");
        fireEvent.click(clear_btn0);
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(2);
        });
    });

    it("最近会话：快捷选择最近 6 个并按结束时间取前六", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([
            ts_sess("s7", "grok", { ended_at: 1000 }),
            ts_sess("s2", "opencode", { ended_at: 6000 }),
            ts_sess("s5", "claude_code", { ended_at: 3000 }),
            ts_sess("s1", "claude_code", { ended_at: 7000 }),
            ts_sess("s6", "grok", { ended_at: 2000 }),
            ts_sess("s4", "opencode", { ended_at: 4000 }),
            ts_sess("s3", "claude_code", { ended_at: 5000 }),
        ]);
        render(<WorkspaceView />);
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "最近 6 个" })).toBeTruthy();
        });
        expect(screen.getByRole("button", { name: "最近 2 个" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "最近 4 个" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "最近 8 个" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "最近 6 个" }));

        expect(
            [...document.querySelectorAll(".ws-recent-check")].map((el) => el.textContent),
        ).toEqual(["1", "2", "3", "4", "5", "6", ""]);
        expect(
            [...document.querySelectorAll(".ws-recent-title")].map((el) => el.textContent),
        ).toEqual(["会话 s1", "会话 s2", "会话 s3", "会话 s4", "会话 s5", "会话 s6", "会话 s7"]);
        expect(screen.getByText("最近会话（选 6/8）")).toBeTruthy();
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(2);
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
            expect(document.querySelectorAll(".rail-title")).toHaveLength(8);
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
        const msgs = document.querySelector(".pane-msgs");
        if (!(msgs instanceof HTMLElement)) throw new Error("pane-msgs not found");
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
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
        });
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
        const select_all = screen.getAllByRole("button", { name: "全选可见" });
        const sa0 = select_all[0];
        const sa1 = select_all[1];
        if (!sa0 || !sa1) throw new Error("select-all buttons missing");
        fireEvent.click(sa0);
        fireEvent.click(sa1);
        // 两槽各全选 → 托盘 2 片段
        await waitFor(() => {
            expect(screen.getByText(/2 片段/)).toBeTruthy();
        });
        const clear_buttons = screen.getAllByRole("button", { name: "清空选择" });
        if (!clear_buttons[0]) throw new Error("clear button missing");
        fireEvent.click(clear_buttons[0]);
        await waitFor(() => {
            expect(screen.getByText(/1 片段/)).toBeTruthy();
        });
    });

    it("rail 可折叠/展开", () => {
        render(<WorkspaceView />);
        expect(document.querySelector(".session-rail")?.className).not.toContain("collapsed");
        fireEvent.click(screen.getByRole("button", { name: "折叠槽位栏" }));
        expect(document.querySelector(".session-rail")?.className).toContain("collapsed");
        fireEvent.click(screen.getByRole("button", { name: "展开槽位栏" }));
        expect(document.querySelector(".session-rail")?.className).not.toContain("collapsed");
    });

    it("Shift 连选：锚点到当前消息范围选中", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [
                msg("m1", "user", "第一条", 100),
                msg("m2", "assistant", "第二条", 200),
                msg("m3", "user", "第三条", 300),
            ],
            next_cursor: null,
        });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("第一条"));
        const boxes = screen.getAllByRole("checkbox");
        expect(boxes.length).toBe(3);
        const box0 = boxes[0];
        const box2 = boxes[2];
        if (!box0 || !box2) throw new Error("checkbox missing");
        fireEvent.click(box0); // 锚点 m1
        fireEvent.click(box2, { shiftKey: true }); // Shift → m1-m3 全选
        await waitFor(() => {
            expect(document.querySelector(".tray-count")?.textContent).toContain("3 片段");
        });
        // f001 回归：set_session 替换后（count 不变时）面板勾选态同步刷新。
        // 锚点仍 m1，再 Shift 点 m2 → 范围收窄为 m1-m2，m3 被替换出。
        const box1 = boxes[1];
        if (!box1) throw new Error("checkbox missing");
        fireEvent.click(box1, { shiftKey: true });
        await waitFor(() => {
            expect(document.querySelector(".tray-count")?.textContent).toContain("2 片段");
        });
        expect((screen.getAllByRole("checkbox")[2] as HTMLInputElement).checked).toBe(false);
    });

    it("f001 回归：count 不变的 set_session 成员替换触发面板勾选刷新", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [
                msg("m1", "user", "第一条", 100),
                msg("m2", "assistant", "第二条", 200),
                msg("m3", "user", "第三条", 300),
            ],
            next_cursor: null,
        });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("第一条"));
        // 点选 m1、m3（count=2），再 set_session 替换为 m1、m2（count 仍 2）——
        // 若不订阅 store，面板 m3 勾选会残留。
        const boxes = screen.getAllByRole("checkbox");
        const b0 = boxes[0];
        const b1 = boxes[1];
        const b2 = boxes[2];
        if (!b0 || !b1 || !b2) throw new Error("checkbox missing");
        fireEvent.click(b0);
        fireEvent.click(b2);
        await waitFor(() => {
            expect(document.querySelector(".tray-count")?.textContent).toContain("2 片段");
        });
        // 直接驱动 store 模拟 Shift 替换（count 不变：2 → 2）。
        act(() => {
            selection_store.set_session(
                { source: "claude_code", env: "win", session_id: "sess_a" },
                [
                    {
                        key: "claude_code|win|sess_a|m1",
                        loc: { source: "claude_code", env: "win", session_id: "sess_a" },
                        message: {
                            id: "m1",
                            role: "user" as const,
                            text: "第一条",
                            timestamp: 100,
                        },
                        role_index: 1,
                        session_title: "会话",
                    },
                    {
                        key: "claude_code|win|sess_a|m2",
                        loc: { source: "claude_code", env: "win", session_id: "sess_a" },
                        message: {
                            id: "m2",
                            role: "assistant" as const,
                            text: "第二条",
                            timestamp: 200,
                        },
                        role_index: 1,
                        session_title: "会话",
                    },
                ],
            );
        });
        await waitFor(() => {
            const checks = screen.getAllByRole("checkbox");
            const c0 = checks[0] as HTMLInputElement | undefined;
            const c1 = checks[1] as HTMLInputElement | undefined;
            const c2 = checks[2] as HTMLInputElement | undefined;
            if (!c0 || !c1 || !c2) throw new Error("checkbox missing");
            expect(c0.checked).toBe(true);
            expect(c1.checked).toBe(true);
            expect(c2.checked).toBe(false);
        });
    });

    it("Space 选中/取消 hover 消息（快捷键）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getAllByText("你好").length > 0);
        const rows = screen.getAllByText("你好");
        const first_row = rows[0];
        if (!first_row) throw new Error("message text missing");
        const row = first_row.closest(".pane-msg-row");
        if (!row) throw new Error("message row missing");
        fireEvent.mouseEnter(row);
        fireEvent.keyDown(window, { code: "Space" });
        await waitFor(() => {
            expect(screen.getByText(/1 片段/)).toBeTruthy();
        });
        fireEvent.keyDown(window, { code: "Space" });
        await waitFor(() => {
            expect(screen.getByText("摘选托盘（空）")).toBeTruthy();
        });
    });

    it("视图菜单按当前会话数提供排布选项并可切换网格列数", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            for (let i = 0; i < 6; i += 1) {
                cb({ source: "claude_code", env: "win", session_id: `layout-${String(i)}` });
            }
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(6);
        });

        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        const three_by_two = screen.getByRole("button", { name: "3 列 × 2 行" });
        const two_by_three = screen.getByRole("button", { name: "2 列 × 3 行" });
        expect(three_by_two).toBeTruthy();
        expect(two_by_three).toBeTruthy();
        expect(three_by_two.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(two_by_three);
        expect(two_by_three.getAttribute("aria-pressed")).toBe("true");
        expect(document.querySelector(".slot-grid")?.getAttribute("style")).toContain("--cols: 2");
    });

    it("8 个会话时视图菜单选中当前有效排布", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            for (let i = 0; i < 8; i += 1) {
                cb({ source: "claude_code", env: "win", session_id: `eight-${String(i)}` });
            }
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(8);
        });

        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        const four_by_two = screen.getByRole("button", { name: "4 列 × 2 行" });
        expect(four_by_two.getAttribute("aria-pressed")).toBe("true");
    });

    it("视图菜单排布选择联动网格列数（--cols）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(2);
        });
        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        fireEvent.click(screen.getByRole("button", { name: "1 列 × 2 行" }));
        expect(document.querySelector(".slot-grid")?.getAttribute("style")).toContain("--cols: 1");
        fireEvent.click(screen.getByRole("button", { name: "2 列 × 1 行" }));
        expect(document.querySelector(".slot-grid")?.getAttribute("style")).toContain("--cols: 2");
    });

    it("聚焦：点聚焦按钮后网格聚焦该面板，再点退出", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
        });
        fireEvent.click(screen.getByRole("button", { name: "聚焦此面板" }));
        expect(document.querySelector(".slot-grid")?.className).toContain("focused");
        expect(document.querySelector('[data-focused="true"]')).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "聚焦此面板" }));
        expect(document.querySelector(".slot-grid")?.className).not.toContain("focused");
    });

    it("快捷键 1-8 聚焦对应槽位，[ ] 循环切换，Esc 退出聚焦", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
            focus_cb()({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(2);
        });
        fireEvent.keyDown(window, { key: "2" });
        expect(document.querySelector(".slot-grid")?.className).toContain("focused");
        const focused_slots = [...document.querySelectorAll('[data-focused="true"]')].map((el) =>
            el.getAttribute("data-loc-key"),
        );
        expect(focused_slots).toEqual(["opencode|win|sess_b"]);

        fireEvent.keyDown(window, { key: "[" });
        const focused_a = [...document.querySelectorAll('[data-focused="true"]')].map((el) =>
            el.getAttribute("data-loc-key"),
        );
        expect(focused_a).toEqual(["claude_code|win|sess_a"]);

        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector(".slot-grid")?.className).not.toContain("focused");
    });

    it("快捷键 Esc 逐层退出：大纲 → 聚焦 → 普通态", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
        });
        // 聚焦 + 大纲同时开
        fireEvent.click(screen.getByRole("button", { name: "聚焦此面板" }));
        fireEvent.click(screen.getByRole("button", { name: "大纲" }));
        expect(document.querySelector(".pane-outline")).toBeTruthy();
        expect(document.querySelector(".slot-grid")?.className).toContain("focused");
        // Esc 1：关大纲
        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector(".pane-outline")).toBeNull();
        expect(document.querySelector(".slot-grid")?.className).toContain("focused");
        // Esc 2：退聚焦
        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector(".slot-grid")?.className).not.toContain("focused");
    });

    it("关闭聚焦槽位后网格不残留聚焦态", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
        });
        fireEvent.click(screen.getByRole("button", { name: "聚焦此面板" }));
        expect(document.querySelector(".slot-grid")?.className).toContain("focused");
        fireEvent.click(screen.getByRole("button", { name: "关闭面板" }));
        await waitFor(() => screen.getByText("工作台为空"));
        // 网格已卸载（count=0），无 focused 残留类
        expect(document.querySelector(".slot-grid")).toBeNull();
    });

    it("视图开关：显示时间戳/紧凑模式即时生效", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [{ id: "m1", role: "user", text: "你好", timestamp: 100 }],
            next_cursor: null,
        });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));

        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        fireEvent.click(screen.getByLabelText("显示时间戳"));
        expect(document.querySelector(".pane-msg-time")).toBeTruthy();
        fireEvent.click(screen.getByLabelText("紧凑模式"));
        expect(document.querySelector(".pane-msg-row")?.className).toContain("compact");
        fireEvent.click(screen.getByLabelText("显示时间戳"));
        expect(document.querySelector(".pane-msg-time")).toBeNull();
    });

    it("兜底轮询间隔降级：面板打开后 60s 内全量 query 不超过 2 次", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render(<WorkspaceView />);
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll(".rail-title")).toHaveLength(1);
        });

        // 初始 mount 已触发一次 query；过滤出 sess_a 的兜底全量 query 调用。
        const sess_a_queries = () =>
            ub.sessionHistory.query.mock.calls.filter(
                (c) => c[0] === "claude_code" && c[1] === "win" && c[2] === "sess_a",
            );
        const initial = sess_a_queries().length;
        expect(initial).toBeGreaterThanOrEqual(1);

        await act(async () => {
            vi.advanceTimersByTime(60_000);
            await Promise.resolve();
        });
        // 30s 周期内 60s 触发 2 次兜底，累计 ≤ initial + 2。
        expect(sess_a_queries().length).toBeLessThanOrEqual(initial + 2);

        vi.useRealTimers();
    });
});
