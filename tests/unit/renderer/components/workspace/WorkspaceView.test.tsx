import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { WorkspaceView } from "../../../../../src/renderer/components/workspace/WorkspaceView";
import { WorkspaceToolbar } from "../../../../../src/renderer/components/workspace/WorkspaceToolbar";
import type { LayoutCount } from "../../../../../src/renderer/lib/workspace/slots";
import {
    load_saved_layout,
    save_layout,
} from "../../../../../src/renderer/lib/workspace/workspace-storage";
import type { PaneView } from "../../../../../src/renderer/components/workspace/SessionPane";
import {
    reset_selection_store,
    selection_store,
} from "../../../../../src/renderer/lib/workspace/selection-store";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * t224 工作台槽位模型测试（取代 t211 6 栏模型语义）。
 * 覆盖：槽位装入/移除/换位、超位 toast、布局切换、入口重接（onFocus/URL loc）、
 * 消息推送追加、选择与复制、全空空态、最近会话替换全部、picker 弹窗。
 *
 * t323：三按钮与 rail-toggle 上移顶栏后，涉及工具栏/rail-toggle/最近会话/视图的
 * 交互测试改经 WorkspaceShellHarness 渲染（P6 起生产壳不再挂工作台）；
 * 纯槽位/消息/选择测试用 render_workspace 提供受控 props。
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

/** t329：localStorage 槽位持久化的读取/预置工具（key 与实现侧 workspace-storage.ts 一致）。 */
function saved_slots(): ({ source: string; env: string; session_id: string } | null)[] {
    return JSON.parse(localStorage.getItem("workspace-slots") ?? "[]") as ({
        source: string;
        env: string;
        session_id: string;
    } | null)[];
}

function seed_slots(locs: { source: string; env: string; session_id: string }[]): void {
    const arr: ({ source: string; env: string; session_id: string } | null)[] = Array.from(
        { length: 8 },
        () => null,
    );
    for (let i = 0; i < locs.length && i < 8; i += 1) {
        const loc = locs[i];
        if (loc) arr[i] = loc;
    }
    localStorage.setItem("workspace-slots", JSON.stringify(arr));
}

/** t323：受控 WorkspaceView 默认 props，测试槽位/消息逻辑。 */
function render_workspace(overrides: Partial<ComponentProps<typeof WorkspaceView>> = {}) {
    return render(
        <WorkspaceView
            layout={3}
            view={{ show_time: false, compact: false }}
            recent_open={false}
            rail_collapsed={false}
            on_rail_toggle={() => undefined}
            on_layout_change={() => undefined}
            on_recent={() => undefined}
            on_recent_close={() => undefined}
            on_count_change={() => undefined}
            on_register_clear={() => undefined}
            {...overrides}
        />,
    );
}

/**
 * P6：生产 SessionShell 不再挂载工作台。
 * 本 harness 保留旧外壳接线，供 WorkspaceView 工具栏/持久化单测继续覆盖。
 */
function WorkspaceShellHarness() {
    const saved_layout = useMemo(() => load_saved_layout(), []);
    const [layout, set_layout] = useState<LayoutCount>(saved_layout?.layout ?? 3);
    const [view, set_view] = useState<PaneView>(
        saved_layout?.view ?? { show_time: false, compact: false },
    );
    const [recent_open, set_recent_open] = useState(false);
    const [rail_collapsed, set_rail_collapsed] = useState(false);
    const [count, set_count] = useState(0);
    const [refresh_token, set_refresh_token] = useState(0);
    const clear_workspace_ref = useRef<(() => void) | null>(null);
    const register_clear = useCallback((fn: (() => void) | null): void => {
        clear_workspace_ref.current = fn;
    }, []);

    useEffect(() => {
        save_layout(layout, view);
    }, [layout, view]);

    return (
        <div data-testid="session-shell">
            <header data-testid="session-topbar">
                <WorkspaceToolbar
                    layout={layout}
                    count={count}
                    view={view}
                    on_view_change={set_view}
                    on_layout_change={set_layout}
                    on_recent={() => {
                        set_recent_open(true);
                    }}
                    on_clear={() => {
                        clear_workspace_ref.current?.();
                    }}
                />
                <button
                    type="button"
                    title="刷新当前面板"
                    onClick={() => {
                        set_refresh_token((k) => k + 1);
                    }}
                >
                    刷新
                </button>
            </header>
            <WorkspaceView
                refresh_token={refresh_token}
                layout={layout}
                view={view}
                recent_open={recent_open}
                rail_collapsed={rail_collapsed}
                on_rail_toggle={() => {
                    set_rail_collapsed((v) => !v);
                }}
                on_layout_change={set_layout}
                on_recent={() => {
                    set_recent_open(true);
                }}
                on_recent_close={() => {
                    set_recent_open(false);
                }}
                on_count_change={set_count}
                on_register_clear={register_clear}
            />
        </div>
    );
}

/** t323：工具栏交互经 harness 渲染（三按钮/rail-toggle）。 */
async function render_shell() {
    render(<WorkspaceShellHarness />);
    await act(async () => {
        await Promise.resolve();
    });
}

/** t329：mount harness 并 flush 副作用，返回结果供 unmount 后重挂载。 */
async function mount_shell() {
    const view = render(<WorkspaceShellHarness />);
    await act(async () => {
        await Promise.resolve();
    });
    return view;
}

beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    reset_selection_store();
    install_history_usageboard();
});

describe("WorkspaceView (t224)", () => {
    it("全空空态：无槽位占用时显示引导，含去会话库/打开最近会话入口", () => {
        render_workspace();
        expect(screen.getByText("工作台为空")).toBeTruthy();
        expect(screen.getByText("打开最近会话")).toBeTruthy();
        expect(screen.getByText("去会话库")).toBeTruthy();
    });

    it("onFocus 打开会话装入槽位，rail 显示元数据", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([ts_sess("sess_a", "claude_code")]);
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(screen.getAllByText("会话 sess_a").length).toBeGreaterThan(0);
        });
        const rail_sub = document.querySelector('[data-testid="session-slot-meta"]');
        expect(rail_sub?.textContent).toContain("3 轮");
        expect(rail_sub?.textContent).toContain("375 tokens");
        expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
    });

    it("重复打开同一会话不重复装入槽位", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
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
        render_workspace();
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
        window.history.replaceState({}, "", "/");
    });

    it("t323 顶栏三按钮保留主要操作入口，无布局数字按钮与会话计数", async () => {
        await render_shell();
        const toolbar = document.querySelector('[data-testid="session-toolbar"]');
        expect(toolbar).toBeTruthy();
        expect(toolbar?.querySelector(".session-layout-switch")).toBeNull();
        expect(toolbar?.querySelector(".session-count")).toBeNull();
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
        render_workspace();
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
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
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
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));
        // t409：头部「全选可见」已删，改走逐条 checkbox。
        fireEvent.click(screen.getByRole("checkbox"));
        // 选中后托盘展开，点托盘「复制」写剪贴板（t226 取代旧工具栏复制）。
        await waitFor(() => {
            expect(document.querySelector('[data-testid="selection-tray"]')?.className).toContain(
                "expanded",
            );
        });
        fireEvent.click(screen.getByRole("button", { name: "复制" }));
        await waitFor(() => {
            expect(write_spy).toHaveBeenCalled();
        });
    });

    it("清空按钮退订全部并回到空态", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        await render_shell();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
            focus_cb()({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
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
        await render_shell();
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => {
            expect(screen.getByText("最近 2 个")).toBeTruthy();
        });
        fireEvent.click(screen.getByRole("button", { name: "最近 2 个" }));
        fireEvent.click(screen.getByRole("button", { name: "清空并替换全部槽位" }));
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
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
        await render_shell();
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "最近 6 个" })).toBeTruthy();
        });
        expect(screen.getByRole("button", { name: "最近 2 个" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "最近 4 个" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "最近 8 个" })).toBeTruthy();

        // 快速选择按钮无条件渲染，但 sessions 由异步 getSessions() 加载——等待
        // 全部 7 行渲染完成再点快捷选择，避免 CPU 饥饿下 pick_first_n 拿到空列表。
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-recent-row"]')).toHaveLength(7);
        });

        fireEvent.click(screen.getByRole("button", { name: "最近 6 个" }));

        expect(
            [...document.querySelectorAll('[data-testid="session-recent-check"]')].map(
                (el) => el.textContent,
            ),
        ).toEqual(["1", "2", "3", "4", "5", "6", ""]);
        expect(
            [...document.querySelectorAll('[data-testid="session-recent-title"]')].map(
                (el) => el.textContent,
            ),
        ).toEqual(["会话 s1", "会话 s2", "会话 s3", "会话 s4", "会话 s5", "会话 s6", "会话 s7"]);
        expect(screen.getByText("最近会话（选 6/8）")).toBeTruthy();
    });

    it("会话选择弹窗：点空槽打开、点会话装入目标槽位", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([ts_sess("s1", "claude_code")]);
        render_workspace();
        fireEvent.click(screen.getByLabelText("槽位 1（空）"));
        await waitFor(() => {
            expect(screen.getByRole("dialog", { name: "选择会话" })).toBeTruthy();
        });
        // t433: 列表由异步 getSessions 渲染——等列表行出现再交互（防静默 0 命中）。
        await screen.findByText("会话 s1");
        fireEvent.click(screen.getByText("会话 s1"));
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
    });

    it("t434 AC-003: 最近会话弹窗打开态下顶栏刷新按原 limit 重查（refresh_token 依赖）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        ub.tokenStats.getSessions.mockResolvedValue([
            ts_sess("s1", "claude_code", { ended_at: 3000 }),
        ]);
        await render_shell();
        // 打开最近会话弹窗：getSessions({limit: RECENT_LIMIT=100}) 至少一次。
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-recent-row"]')).toHaveLength(1);
        });
        const recent_calls = () =>
            ub.tokenStats.getSessions.mock.calls.filter(
                (c) => (c[0] as { limit?: number } | undefined)?.limit === 100,
            ).length;
        const calls_before = recent_calls();
        expect(calls_before).toBeGreaterThan(0);

        // 弹窗保持打开态点顶栏刷新：refresh_token 递增 → 弹窗 effect 依赖变化 → 重查。
        // 按 limit:100 参数区分弹窗调用（隐藏挂载的 SessionLibrary 重拉带 limit:50，
        // 不污染本断言——t434_code_f004）。
        fireEvent.click(screen.getByTitle("刷新当前面板"));
        await waitFor(() => {
            expect(recent_calls()).toBeGreaterThan(calls_before);
        });
    });

    it("rail 拖拽换位顺序同步网格", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
        });
        await waitFor(() => {
            expect(
                [...document.querySelectorAll('[data-testid="session-slot-title"]')].length,
            ).toBe(2);
        });
        const titles_before = [
            ...document.querySelectorAll('[data-testid="session-slot-title"]'),
        ].map((el) => el.textContent);
        const a_slot = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="session-slot"]'),
        ].find((el) => el.textContent.includes("sess_a"));
        const b_slot = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="session-slot"]'),
        ].find((el) => el.textContent.includes("sess_b"));
        if (!a_slot || !b_slot) throw new Error("rail slots not found");
        fireEvent.dragStart(a_slot);
        fireEvent.drop(b_slot);
        await waitFor(() => {
            const titles = [...document.querySelectorAll('[data-testid="session-slot-title"]')].map(
                (el) => el.textContent,
            );
            expect(titles).not.toEqual(titles_before);
        });
        const titles_after = [
            ...document.querySelectorAll('[data-testid="session-slot-title"]'),
        ].map((el) => el.textContent);
        expect(titles_after[0]).toBe("sess_b");
        expect(titles_after[1]).toBe("sess_a");
    });

    it("槽位全满后 onFocus 新会话 toast 拒绝", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        const cb = focus_cb();
        act(() => {
            for (let i = 0; i < 8; i += 1) {
                cb({ source: "claude_code", env: "win", session_id: `s${String(i)}` });
            }
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(8);
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
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));
        expect(ub.sessionHistory.query).toHaveBeenCalledWith("claude_code", "win", "sess_a", {
            limit: 200,
        });
        const msgs = document.querySelector('[data-testid="conversation-message-scroll"]');
        if (!(msgs instanceof HTMLElement))
            throw new Error("conversation-message-scroll not found");
        // t377: 显式 scrollTop 声明——jsdom 无布局 scrollTop 默认 0，弱断言下滚动
        // 恒触发 older 加载不验证位置语义。先设「不在顶部」负向验证不加载。
        msgs.scrollTop = 500;
        fireEvent.scroll(msgs);
        await waitFor(() => {
            expect(ub.sessionHistory.query).toHaveBeenCalledTimes(1);
        });
        expect(ub.sessionHistory.query).not.toHaveBeenCalledWith(
            "claude_code",
            "win",
            "sess_a",
            expect.objectContaining({ before_cursor: "c1" }),
        );
        // 设回顶部，正向下拉更早消息。
        msgs.scrollTop = 0;
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
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "s1" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
        fireEvent.click(screen.getByRole("button", { name: "槽位 2（空）" }));
        await waitFor(() => screen.getByRole("dialog", { name: "选择会话" }));
        // t433: 列表异步渲染——等 picker 行出现再断言计数（防静默空列表）。
        await waitFor(() => {
            expect(screen.getByText("全部 3")).toBeTruthy();
        });
        expect(screen.getByText("Claude 1")).toBeTruthy();
        expect(screen.getByText("已打开")).toBeTruthy();

        const picker_titles = () =>
            [...document.querySelectorAll('[data-testid="session-picker-row-title"]')].map(
                (el) => el.textContent,
            );
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
        await render_shell();
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => screen.getByRole("dialog", { name: "最近会话" }));
        // 等会话列表拉回后再读标题（全量并行时 mock resolve 可能晚于 dialog 挂载）。
        await waitFor(() => {
            const titles = [
                ...document.querySelectorAll('[data-testid="session-recent-title"]'),
            ].map((el) => el.textContent);
            expect(titles).toEqual(["会话 new", "会话 mid", "会话 old"]);
        });

        const confirm_btn = screen.getByRole("button", { name: "清空并替换全部槽位" });
        expect((confirm_btn as HTMLButtonElement).disabled).toBe(true);

        const rows = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="session-recent-row"]'),
        ];
        const first = rows[0];
        const second = rows[1];
        if (!first || !second) throw new Error("recent rows missing");
        fireEvent.click(first);
        fireEvent.click(second);
        expect(screen.getByText(/选 2\/8/)).toBeTruthy();
        expect(
            [...document.querySelectorAll('[data-testid="session-recent-check"]')].map(
                (el) => el.textContent,
            ),
        ).toEqual(["1", "2", ""]);
    });

    it("recent：选择第 9 个被拒（上限 8）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        const list = Array.from({ length: 9 }, (_, i) =>
            ts_sess(`s${String(i)}`, "claude_code", { ended_at: 9000 - i }),
        );
        ub.tokenStats.getSessions.mockResolvedValue(list);
        await render_shell();
        fireEvent.click(screen.getByRole("button", { name: "最近会话" }));
        await waitFor(() => screen.getByRole("dialog", { name: "最近会话" }));
        // t433: 列表由异步 getSessions 渲染——等 9 行齐全再点击（防静默 0 命中）。
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-recent-row"]')).toHaveLength(9);
        });
        const rows = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="session-recent-row"]'),
        ];
        for (const row of rows) {
            fireEvent.click(row);
        }
        expect(document.querySelectorAll('[data-testid="session-recent-check"].on').length).toBe(8);
        expect(screen.getByText(/选 8\/8/)).toBeTruthy();
    });

    it("跨槽位 checkbox 选中计数合计与取消勾选", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render_workspace();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(screen.getAllByText("你好").length).toBe(2);
        });
        // t409：头部全选/清空已删，改走逐条 checkbox。
        const boxes = screen.getAllByRole("checkbox");
        const box0 = boxes[0];
        const box1 = boxes[1];
        if (!box0 || !box1) throw new Error("checkbox missing");
        fireEvent.click(box0);
        fireEvent.click(box1);
        await waitFor(() => {
            expect(screen.getByText(/2 片段/)).toBeTruthy();
        });
        fireEvent.click(box0);
        await waitFor(() => {
            expect(screen.getByText(/1 片段/)).toBeTruthy();
        });
    });

    it("rail 可折叠/展开（t323 上移顶栏后行为不变）", async () => {
        await render_shell();
        expect(document.querySelector('[data-testid="session-rail"]')?.className).not.toContain(
            "collapsed",
        );
        fireEvent.click(screen.getByRole("button", { name: "折叠槽位栏" }));
        expect(document.querySelector('[data-testid="session-rail"]')?.className).toContain(
            "collapsed",
        );
        fireEvent.click(screen.getByRole("button", { name: "展开槽位栏" }));
        expect(document.querySelector('[data-testid="session-rail"]')?.className).not.toContain(
            "collapsed",
        );
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
        render_workspace();
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
            expect(
                document.querySelector('[data-testid="selection-tray-count"]')?.textContent,
            ).toContain("3 片段");
        });
        // f001 回归：set_session 替换后（count 不变时）面板勾选态同步刷新。
        // 锚点仍 m1，再 Shift 点 m2 → 范围收窄为 m1-m2，m3 被替换出。
        const box1 = boxes[1];
        if (!box1) throw new Error("checkbox missing");
        fireEvent.click(box1, { shiftKey: true });
        await waitFor(() => {
            expect(
                document.querySelector('[data-testid="selection-tray-count"]')?.textContent,
            ).toContain("2 片段");
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
        render_workspace();
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
            expect(
                document.querySelector('[data-testid="selection-tray-count"]')?.textContent,
            ).toContain("2 片段");
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
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getAllByText("你好").length > 0);
        const rows = screen.getAllByText("你好");
        const first_row = rows[0];
        if (!first_row) throw new Error("message text missing");
        const row = first_row.closest('[data-testid="conversation-message-row"]');
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
        await render_shell();
        const cb = focus_cb();
        act(() => {
            for (let i = 0; i < 6; i += 1) {
                cb({ source: "claude_code", env: "win", session_id: `layout-${String(i)}` });
            }
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(6);
        });

        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        const three_by_two = screen.getByRole("button", { name: "3 列 × 2 行" });
        const two_by_three = screen.getByRole("button", { name: "2 列 × 3 行" });
        expect(three_by_two).toBeTruthy();
        expect(two_by_three).toBeTruthy();
        expect(three_by_two.getAttribute("aria-pressed")).toBe("true");

        fireEvent.click(two_by_three);
        expect(two_by_three.getAttribute("aria-pressed")).toBe("true");
        expect(
            document.querySelector('[data-testid="session-grid"]')?.getAttribute("style"),
        ).toContain("--cols: 2");
    });

    it("8 个会话时视图菜单选中当前有效排布", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        await render_shell();
        const cb = focus_cb();
        act(() => {
            for (let i = 0; i < 8; i += 1) {
                cb({ source: "claude_code", env: "win", session_id: `eight-${String(i)}` });
            }
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(8);
        });

        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        const four_by_two = screen.getByRole("button", { name: "4 列 × 2 行" });
        expect(four_by_two.getAttribute("aria-pressed")).toBe("true");
    });

    it("视图菜单排布选择联动网格列数（--cols）", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        await render_shell();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
        });
        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        fireEvent.click(screen.getByRole("button", { name: "1 列 × 2 行" }));
        expect(
            document.querySelector('[data-testid="session-grid"]')?.getAttribute("style"),
        ).toContain("--cols: 1");
        fireEvent.click(screen.getByRole("button", { name: "2 列 × 1 行" }));
        expect(
            document.querySelector('[data-testid="session-grid"]')?.getAttribute("style"),
        ).toContain("--cols: 2");
    });

    it("AC-001：头部无全选可见/清空选择/聚焦此面板按钮", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));
        for (const label of ["全选可见", "清空选择", "聚焦此面板"]) {
            expect(screen.queryByRole("button", { name: label })).toBeNull();
        }
        // AC-003：大纲/关闭仍在
        expect(screen.getByRole("button", { name: "大纲" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "关闭面板" })).toBeTruthy();
    });

    it("AC-003：点击关闭面板移除槽位回到空态", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
        fireEvent.click(screen.getByRole("button", { name: "关闭面板" }));
        await waitFor(() => {
            expect(screen.getByText("工作台为空")).toBeTruthy();
        });
        expect(ub.sessionHistory.unsubscribe).toHaveBeenCalledWith("claude_code", "win", "sess_a");
    });

    it("快捷键 Esc 关闭大纲", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
        fireEvent.click(screen.getByRole("button", { name: "大纲" }));
        expect(document.querySelector('[data-testid="conversation-outline"]')).toBeTruthy();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector('[data-testid="conversation-outline"]')).toBeNull();
        // AC-002：网格无 focused 类与 data-focused
        expect(document.querySelector('[data-testid="session-grid"]')?.className).not.toContain(
            "focused",
        );
        expect(document.querySelector("[data-focused]")).toBeNull();
    });

    it("快捷键 1-8 / [ ] 不再触发聚焦布局", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
            focus_cb()({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
        });
        fireEvent.keyDown(window, { key: "2" });
        fireEvent.keyDown(window, { key: "]" });
        fireEvent.keyDown(window, { key: "[" });
        expect(document.querySelector('[data-testid="session-grid"]')?.className).not.toContain(
            "focused",
        );
        expect(document.querySelector('[data-testid="session-cell"].col-span-full')).toBeNull();
        expect(document.querySelector('[data-testid="session-cell"].hidden')).toBeNull();
        // 两槽均仍可见
        expect(document.querySelectorAll('[data-testid="session-cell"]').length).toBe(2);
    });

    it("视图开关：紧凑模式即时生效；消息时间不再受显示时间戳开关控制 (t427)", async () => {
        // t427 语义变更：消息时间仅随展开态，show_time 开关对消息时间无效
        // （spec AC-007）。原 t224 断言「show_time 控制消息时间」被取代，改为
        // 验证开关不再影响 + 紧凑模式保持；折叠态恒无时间节点。
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [{ id: "m1", role: "user", text: "你好", timestamp: 100 }],
            next_cursor: null,
        });
        await render_shell();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => screen.getByText("你好"));

        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        fireEvent.click(screen.getByLabelText("紧凑模式"));
        expect(
            document.querySelector('[data-testid="conversation-message-row"]')?.className,
        ).toContain("compact");
        // t427：消息时间仅随展开态，show_time 开关不再影响（折叠态无时间节点）。
        fireEvent.click(screen.getByLabelText("显示时间戳"));
        expect(document.querySelector('[data-testid="conversation-message-time"]')).toBeNull();
        fireEvent.click(screen.getByLabelText("显示时间戳"));
        expect(document.querySelector('[data-testid="conversation-message-time"]')).toBeNull();
    });

    it("兜底轮询间隔降级：面板打开后 60s 内全量 query 不超过 2 次", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
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

    it("t406 AC-001/002：根背景 surface-window、卡片 surface-card", async () => {
        // t411 起网格改透明 card-gap，不再断言 gap-px 描线网格（见 t411 AC-001/002 用例）。
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render_workspace();
        const root = document.querySelector('[data-testid="session-workspace"]');
        expect(root?.className).toContain("bg-[var(--color-surface-window)]");
        expect(root?.className).not.toContain("bg-[var(--color-surface)]");
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
        // 单元格与根同色（surface-window），卡片为 surface-card（非 raised 整面）。
        const cell = document.querySelector('[data-testid="session-cell"]');
        expect(cell?.className).toContain("bg-[var(--color-surface-window)]");
        expect(cell?.className).not.toContain("bg-[var(--color-surface)]");
        const pane = document.querySelector('[data-testid="conversation-pane"]');
        expect(pane?.className).toContain("bg-[var(--color-surface-card)]");
        expect(pane?.className).not.toMatch(/(?<!hover:)bg-\[var\(--color-surface-raised\)\]/);
        const rail = document.querySelector('[data-testid="session-rail"]');
        expect(rail?.className).toContain("bg-[var(--color-surface-window)]");
        expect(rail?.className).not.toContain("color-mix");
    });

    it("t411 AC-001/002：session-grid 透明 card-gap，无描线网格", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
        const grid = document.querySelector('[data-testid="session-grid"]');
        expect(grid).toBeTruthy();
        const cn = grid?.className ?? "";
        // AC-001：去掉 gap-px 描线网格（bg-outline + p-px）。
        expect(cn).not.toContain("gap-px");
        expect(cn).not.toContain("bg-[var(--color-outline)]");
        expect(cn).not.toMatch(/(?:^|\s)p-px(?:\s|$)/);
        // AC-002：间隙宽度取 spacing.card-gap token。
        expect(cn).toContain("gap-[var(--spacing-card-gap)]");
    });
});

describe("WorkspaceView (t323 顶栏按钮上移后布局)", () => {
    it("AC-003：次级 topbar 行移除，body 直顶容器，grid 与 rail 并列同基线", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        act(() => {
            focus_cb()({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelector('[data-testid="session-slot-title"]')).toBeTruthy();
        });
        // 无独立次级 topbar 行（三按钮与 rail-toggle 已上移顶栏）。
        expect(document.querySelector(".session-workspace-topbar")).toBeNull();
        // body 为根容器首个子元素（上方无 topbar 占位行，grid 顶边直顶顶栏下边）。
        const root = document.querySelector('[data-testid="session-workspace"]');
        const body = document.querySelector('[data-testid="session-workspace-body"]');
        expect(root?.firstElementChild).toBe(body);
        // rail 与 grid 并列于 body，同一水平基线。
        expect(body?.querySelector('[data-testid="session-rail"]')).toBeTruthy();
        expect(body?.querySelector('[data-testid="session-grid"]')).toBeTruthy();
    });
});

describe("WorkspaceView 面板 agent icon 拖拽换槽 (t410)", () => {
    function pane_badge_for(session_id: string): HTMLElement {
        const cell = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="session-cell"]'),
        ].find((el) => (el.getAttribute("data-loc-key") ?? "").includes(session_id));
        const badge = cell?.querySelector<HTMLElement>('[data-testid="conversation-agent-badge"]');
        if (!badge) throw new Error(`badge for ${session_id} not found`);
        return badge;
    }

    function pane_root_for(session_id: string): HTMLElement {
        const pane = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="conversation-pane"]'),
        ].find((el) => (el.getAttribute("data-loc-key") ?? "").includes(session_id));
        if (!pane) throw new Error(`pane for ${session_id} not found`);
        return pane;
    }

    async function open_two_sessions(): Promise<void> {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        render_workspace();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
            expect(document.querySelectorAll('[data-testid="conversation-pane"]')).toHaveLength(2);
        });
    }

    it("AC-001：从 agent icon 拖到另一面板后槽位互换，侧栏顺序同步", async () => {
        await open_two_sessions();
        const titles_before = [
            ...document.querySelectorAll('[data-testid="session-slot-title"]'),
        ].map((el) => el.textContent);
        expect(titles_before).toEqual(["sess_a", "sess_b"]);
        const a_badge = pane_badge_for("sess_a");
        const b_pane = pane_root_for("sess_b");
        fireEvent.dragStart(a_badge);
        fireEvent.dragOver(b_pane);
        fireEvent.drop(b_pane);
        await waitFor(() => {
            const titles = [...document.querySelectorAll('[data-testid="session-slot-title"]')].map(
                (el) => el.textContent,
            );
            expect(titles).toEqual(["sess_b", "sess_a"]);
        });
        // 网格 data-loc-key 顺序同步（DOM 顺序即槽位顺序）
        const cell_keys = [...document.querySelectorAll('[data-testid="session-cell"]')].map((el) =>
            el.getAttribute("data-loc-key"),
        );
        expect(cell_keys[0]).toContain("sess_b");
        expect(cell_keys[1]).toContain("sess_a");
    });

    it("AC-002：悬停目标槽位出现 drop-target 高亮，离开后清除", async () => {
        await open_two_sessions();
        const a_badge = pane_badge_for("sess_a");
        const b_pane = pane_root_for("sess_b");
        fireEvent.dragStart(a_badge);
        expect(document.querySelector('[data-dragging="true"]')).toBeTruthy();
        fireEvent.dragOver(b_pane);
        expect(b_pane.getAttribute("data-drop-target") === "true").toBe(true);
        fireEvent.dragLeave(b_pane);
        expect(b_pane.getAttribute("data-drop-target") === "true").toBe(false);
        fireEvent.dragEnd(a_badge);
        expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    });

    it("AC-003：拖到无效区域松开后布局不变", async () => {
        await open_two_sessions();
        const titles_before = [
            ...document.querySelectorAll('[data-testid="session-slot-title"]'),
        ].map((el) => el.textContent);
        const a_badge = pane_badge_for("sess_a");
        fireEvent.dragStart(a_badge);
        // 无 drop 目标：直接 dragEnd
        fireEvent.dragEnd(a_badge);
        const titles_after = [
            ...document.querySelectorAll('[data-testid="session-slot-title"]'),
        ].map((el) => el.textContent);
        expect(titles_after).toEqual(titles_before);
    });

    it("AC-004：单击 agent icon 不改布局", async () => {
        await open_two_sessions();
        const titles_before = [
            ...document.querySelectorAll('[data-testid="session-slot-title"]'),
        ].map((el) => el.textContent);
        fireEvent.click(pane_badge_for("sess_a"));
        const titles_after = [
            ...document.querySelectorAll('[data-testid="session-slot-title"]'),
        ].map((el) => el.textContent);
        expect(titles_after).toEqual(titles_before);
    });

    it("AC-005：面板拖拽换序后持久化，重挂载恢复交换后顺序", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        const first = render_workspace();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="conversation-pane"]')).toHaveLength(2);
        });
        fireEvent.dragStart(pane_badge_for("sess_a"));
        fireEvent.drop(pane_root_for("sess_b"));
        await waitFor(() => {
            const saved = saved_slots();
            expect(saved[0]).toMatchObject({ source: "opencode", session_id: "sess_b" });
            expect(saved[1]).toMatchObject({ source: "claude_code", session_id: "sess_a" });
        });
        first.unmount();
        render_workspace();
        await waitFor(() => {
            const titles = [...document.querySelectorAll('[data-testid="session-slot-title"]')].map(
                (el) => el.textContent,
            );
            expect(titles).toEqual(["sess_b", "sess_a"]);
        });
    });
});

describe("WorkspaceView (t329 槽位/布局/视图持久化)", () => {
    it("AC-001：打开会话写入 localStorage，重挂载恢复槽位数量与顺序", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        const first = render_workspace();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
        });
        await waitFor(() => {
            const saved = saved_slots();
            expect(saved.filter((s) => s !== null)).toHaveLength(2);
            expect(saved[0]).toMatchObject({ source: "claude_code", session_id: "sess_a" });
            expect(saved[1]).toMatchObject({ source: "opencode", session_id: "sess_b" });
        });
        first.unmount();
        render_workspace();
        await waitFor(() => {
            const titles = [...document.querySelectorAll('[data-testid="session-slot-title"]')].map(
                (el) => el.textContent,
            );
            expect(titles).toEqual(["sess_a", "sess_b"]);
        });
    });

    it("AC-002：恢复槽位重新订阅并拉取消息渲染，非空白", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        seed_slots([{ source: "claude_code", env: "win", session_id: "sess_a" }]);
        render_workspace();
        await waitFor(() => screen.getByText("你好"));
        expect(ub.sessionHistory.subscribe).toHaveBeenCalledWith("claude_code", "win", "sess_a");
        expect(ub.sessionHistory.query).toHaveBeenCalledWith("claude_code", "win", "sess_a", {
            limit: 200,
        });
        expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
    });

    it("AC-004：清空后持久化清空，重开为空工作台", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        const first = await mount_shell();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(1);
        });
        const clear_btn = screen.getAllByRole("button", { name: "清空" })[0];
        if (!clear_btn) throw new Error("清空按钮缺失");
        fireEvent.click(clear_btn);
        await waitFor(() => screen.getByText("工作台为空"));
        expect(saved_slots().every((s) => s === null)).toBe(true);
        first.unmount();
        await mount_shell();
        expect(screen.getByText("工作台为空")).toBeTruthy();
    });

    it("AC-005：拖动换序后持久化，重开恢复交换后顺序", async () => {
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({ messages: [], next_cursor: null });
        const first = render_workspace();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="session-slot-title"]')).toHaveLength(2);
        });
        const a_slot = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="session-slot"]'),
        ].find((el) => el.textContent.includes("sess_a"));
        const b_slot = [
            ...document.querySelectorAll<HTMLElement>('[data-testid="session-slot"]'),
        ].find((el) => el.textContent.includes("sess_b"));
        if (!a_slot || !b_slot) throw new Error("rail slots not found");
        fireEvent.dragStart(a_slot);
        fireEvent.drop(b_slot);
        await waitFor(() => {
            const saved = saved_slots();
            expect(saved[0]).toMatchObject({ source: "opencode", session_id: "sess_b" });
            expect(saved[1]).toMatchObject({ source: "claude_code", session_id: "sess_a" });
        });
        first.unmount();
        render_workspace();
        await waitFor(() => {
            const titles = [...document.querySelectorAll('[data-testid="session-slot-title"]')].map(
                (el) => el.textContent,
            );
            expect(titles).toEqual(["sess_b", "sess_a"]);
        });
    });

    it("AC-003：重开后布局列数与视图开关保持", async () => {
        // t427：conversation-message-time 折叠态恒不存在（时间随展开态），
        // t329 该两处时间断言移除，保留布局列数 + compact 持久化断言。
        const ub = usageboard();
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "你好", 100)],
            next_cursor: null,
        });
        const first = await mount_shell();
        const cb = focus_cb();
        act(() => {
            cb({ source: "claude_code", env: "win", session_id: "sess_a" });
            cb({ source: "opencode", env: "win", session_id: "sess_b" });
        });
        await waitFor(() => {
            expect(screen.getAllByText("你好").length).toBeGreaterThan(0);
        });
        fireEvent.click(screen.getByRole("button", { name: /视图/ }));
        fireEvent.click(screen.getByRole("button", { name: "1 列 × 2 行" }));
        fireEvent.click(screen.getByLabelText("显示时间戳"));
        fireEvent.click(screen.getByLabelText("紧凑模式"));
        expect(
            screen.getByRole("button", { name: "1 列 × 2 行" }).getAttribute("aria-pressed"),
        ).toBe("true");
        expect(
            document.querySelector('[data-testid="conversation-message-row"]')?.className,
        ).toContain("compact");
        expect(JSON.parse(localStorage.getItem("workspace-layout") ?? "{}")).toMatchObject({
            layout: 1,
            view: { show_time: true, compact: true },
        });

        first.unmount();
        await mount_shell();
        await waitFor(() => {
            expect(
                document.querySelector('[data-testid="session-grid"]')?.getAttribute("style"),
            ).toContain("--cols: 1");
        });
        await waitFor(() => {
            expect(
                document.querySelector('[data-testid="conversation-message-row"]')?.className,
            ).toContain("compact");
        });
    });

    it("t329 容错：损坏的持久化数据回退默认，不阻塞渲染", async () => {
        localStorage.setItem("workspace-slots", "not-json");
        localStorage.setItem("workspace-layout", "not-json");
        await mount_shell();
        expect(screen.getByText("工作台为空")).toBeTruthy();
    });

    it("t329 容错 test f001：损坏 workspace-layout 回退默认布局（3 列、视图关）", async () => {
        localStorage.setItem("workspace-layout", "not-json");
        await mount_shell();
        // 布局列数回退默认 3：网格 grid-cols auto-fill 不可直接读，经 layout 状态验证——
        // 视图开关渲染（无 show_time/compact 标记）即回退默认。布局经 save 写回验证回退值。
        expect(JSON.parse(localStorage.getItem("workspace-layout") ?? "{}")).toMatchObject({
            layout: 3,
            view: { show_time: false, compact: false },
        });
    });
});
