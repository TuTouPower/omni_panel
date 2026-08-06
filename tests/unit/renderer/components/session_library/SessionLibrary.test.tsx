import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCard } from "../../../../../src/renderer/components/session-library/SessionCard";
import { SessionLibrary } from "../../../../../src/renderer/components/session-library/SessionLibrary";
import { key_of } from "../../../../../src/renderer/components/session-library/session-library-utils";
import type { TokenStatsSession } from "../../../../../src/shared/types/token-stats";
import { install_history_usageboard } from "../../views/session_history_test_utils";

/**
 * t227 会话库视图测试。
 * 覆盖：页头统计行、agent 多选/排序/视图切换、卡片信息、勾选上限、预览抽屉、
 * SelectionDock 并排打开、空态、加载更多。
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

async function renderLibrary(props: { on_switch_workspace?: () => void } = {}) {
    const result = render(
        <SessionLibrary on_switch_workspace={props.on_switch_workspace ?? (() => undefined)} />,
    );
    await act(async () => {
        // 冲刷 getSessions/query resolve 等微任务，避免 act 警告。
    });
    return result;
}

const T0 = new Date("2026-07-10T08:00:00Z").getTime();

function sess(
    id: string,
    source: string,
    opts: { calls?: number; input_tokens?: number; started_at?: number; ended_at?: number } = {},
) {
    return {
        id,
        source,
        env: "win",
        model: "model",
        title: `会话 ${id}`,
        directory: `/proj/${id}`,
        input_tokens: opts.input_tokens ?? 100,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_write_tokens: 25,
        calls: opts.calls ?? 3,
        started_at: opts.started_at ?? T0,
        ended_at: opts.ended_at ?? T0 + 2000,
    };
}

function msg(id: string, role: "user" | "assistant", text: string, ts: number) {
    return { id, role, text, timestamp: ts };
}

const SESSIONS = [
    sess("a", "claude_code", { calls: 5, ended_at: T0 + 3000 }),
    sess("b", "opencode", { calls: 2, ended_at: T0 + 1000 }),
    sess("c", "grok", { calls: 9, ended_at: T0 + 2000 }),
];

beforeEach(() => {
    install_history_usageboard();
});

describe("SessionLibrary (t227)", () => {
    it("页头显示统计行：会话数/agent 数/总 tokens", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => {
            expect(screen.getByText(/3 个会话/)).toBeTruthy();
        });
        expect(screen.getByText(/3 个 Agent/)).toBeTruthy();
        expect(screen.getByText(/1,125 tokens/)).toBeTruthy();
    });

    it("搜索框默认只匹配元信息，卡片显示 agent 色条/徽标/标题/轮数/tokens/目录", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "proj/b" } });
        expect(screen.getByText("会话 b")).toBeTruthy();
        expect(screen.queryByText("会话 a")).toBeNull();
        const card = document.querySelector(".lib-card");
        expect(card).toBeTruthy();
        expect(card?.querySelector(".lib-card-accent")).toBeTruthy();
        expect(card?.querySelector(".lib-card-badge")?.textContent).toBe("OC");
        expect(card?.querySelector(".lib-card-title")?.textContent).toContain("会话 b");
        expect(card?.querySelector(".lib-card-summary")).toBeTruthy();
        expect(card?.querySelector(".lib-card-meta")?.textContent).toContain("2 轮");
        expect(card?.querySelector(".lib-card-meta")?.textContent).toContain("375 tokens");
        expect(card?.querySelector(".lib-card-dir")?.textContent).toContain("/proj/b");
    });

    it("卡片与行摘要取首条用户消息内容（f008）", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue([sess("a", "claude_code")]);
        ub.sessionHistory.query.mockResolvedValue({
            messages: [
                msg("m1", "assistant", "不应显示的回复", 1),
                msg("m2", "user", "真正要显示的用户消息", 2),
            ],
            next_cursor: null,
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        await waitFor(() => {
            const card_summary = document.querySelector(".lib-card-summary")?.textContent;
            expect(card_summary).toContain("真正要显示的用户消息");
            expect(card_summary).not.toContain("不应显示的回复");
        });
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        await waitFor(() => {
            const row_summary = document.querySelector(".lib-row-summary")?.textContent;
            expect(row_summary).toContain("真正要显示的用户消息");
        });
    });

    it("agent 芯片多选过滤 + 排序 + 视图切换", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.click(screen.getByRole("button", { name: /^Claude/ }));
        expect(screen.getByText("会话 a")).toBeTruthy();
        expect(screen.queryByText("会话 b")).toBeNull();
        expect(screen.queryByText("会话 c")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /^Grok/ }));
        expect(screen.getByText("会话 c")).toBeTruthy();
        // 排序：calls desc → c 在前
        fireEvent.change(screen.getByLabelText("排序方式"), { target: { value: "calls" } });
        const first_card = document.querySelector(".lib-card-title");
        expect(first_card?.textContent).toContain("会话 c");
        // 列表视图
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        expect(document.querySelector(".lib-list")).toBeTruthy();
        const row = document.querySelector(".lib-row");
        expect(row?.querySelector(".lib-row-title")?.textContent).toContain("会话 c");
        expect(row?.querySelector(".lib-row-badge")?.textContent).toBe("G");
        expect(row?.querySelector(".lib-row-meta")?.textContent).toContain("9 轮");
        expect(row?.querySelector(".lib-row-dir")?.textContent).toContain("/proj/c");
    });

    it("起始日期输入过滤：活动时间结束于起始日之前的会话被排除（f002）", async () => {
        const ub = usageboard();
        const day = 24 * 3600 * 1000;
        const start_day = new Date("2026-07-10T00:00:00").getTime();
        const older = sess("old", "claude_code", {
            started_at: start_day - 2 * day,
            ended_at: start_day - day,
        });
        const newer = sess("new", "opencode", {
            started_at: start_day,
            ended_at: start_day + day,
        });
        ub.tokenStats.getSessions.mockResolvedValue([older, newer]);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 new"));
        fireEvent.change(screen.getByLabelText("起始日期"), { target: { value: "2026-07-10" } });
        expect(screen.queryByText("会话 old")).toBeNull();
        expect(screen.getByText("会话 new")).toBeTruthy();
    });

    it("结束日期输入过滤：活动时间起始于结束日之后的会话被排除（f002）", async () => {
        const ub = usageboard();
        const day = 24 * 3600 * 1000;
        const start_day = new Date("2026-07-10T00:00:00").getTime();
        const older = sess("old", "claude_code", {
            started_at: start_day - 2 * day,
            ended_at: start_day - day,
        });
        const newer = sess("new", "opencode", {
            started_at: start_day,
            ended_at: start_day + day,
        });
        ub.tokenStats.getSessions.mockResolvedValue([older, newer]);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 new"));
        fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-07-09" } });
        expect(screen.getByText("会话 old")).toBeTruthy();
        expect(screen.queryByText("会话 new")).toBeNull();
    });

    it("点卡片勾选会话，上限 8 第 9 个提示", async () => {
        const ub = usageboard();
        const many = Array.from({ length: 9 }, (_, i) => sess(`s${String(i)}`, "claude_code"));
        ub.tokenStats.getSessions.mockResolvedValue(many);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 s0"));
        const cards = screen.getAllByRole("button", { name: /会话 s\d/ });
        for (const c of cards) fireEvent.click(c);
        expect(screen.getByText(/8\/8/)).toBeTruthy();
    });

    it("预览抽屉显示前 5 条消息，Esc 关闭", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        ub.sessionHistory.query.mockResolvedValue({
            messages: [
                msg("m1", "user", "消息一", 1),
                msg("m2", "assistant", "消息二", 2),
                msg("m3", "user", "消息三", 3),
                msg("m4", "assistant", "消息四", 4),
                msg("m5", "user", "消息五", 5),
                msg("m6", "user", "消息六", 6),
            ],
            next_cursor: null,
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        const preview_btns = screen.getAllByRole("button", { name: "预览" });
        const preview_btn = preview_btns[0];
        if (!preview_btn) throw new Error("preview button missing");
        fireEvent.click(preview_btn);
        // 预览抽屉显示前 5 条消息（断言抽屉内 DOM；卡片摘要可能同文本）。
        await waitFor(() => {
            expect(document.querySelectorAll(".lib-preview-msg").length).toBe(5);
        });
        expect(document.querySelectorAll(".lib-preview-msg")[4]?.textContent).toContain("消息五");
        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector(".lib-preview")).toBeNull();
    });

    it("SelectionDock 并排打开写入工作台槽位并切页签", async () => {
        const ub = usageboard();
        const switch_fn = vi.fn();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary({ on_switch_workspace: switch_fn });
        await waitFor(() => screen.getByText("会话 a"));
        const cards = screen.getAllByRole("button", { name: /会话 [abc]/ });
        const card0 = cards[0];
        const card1 = cards[1];
        if (!card0 || !card1) throw new Error("card missing");
        fireEvent.click(card0);
        fireEvent.click(card1);
        expect(screen.getByText("2/8")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /并排打开/ }));
        expect(ub.sessionHistory.open).toHaveBeenCalledTimes(2);
        expect(switch_fn).toHaveBeenCalled();
    });

    it("无匹配结果显示清除筛选空态", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "不存在" } });
        expect(screen.getByText("没有匹配的会话")).toBeTruthy();
        expect(screen.getByText(/清除筛选/)).toBeTruthy();
    });

    it("加载失败且筛选 0 条时显示加载失败并保留清除筛选", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockRejectedValue(new Error("boom"));
        await renderLibrary();
        await waitFor(() => screen.getByText("会话列表加载失败"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "x" } });
        expect(screen.getByText("会话列表加载失败")).toBeTruthy();
        expect(screen.getByText(/清除筛选/)).toBeTruthy();
    });

    it("中途分页失败时展示已加载数据并显示加载中断提示", async () => {
        const ub = usageboard();
        const first = Array.from({ length: 500 }, (_, i) =>
            sess(`p${String(i)}`, "claude_code"),
        );
        ub.tokenStats.getSessions
            .mockResolvedValueOnce(first)
            .mockRejectedValueOnce(new Error("boom"));
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 p0"));
        expect(document.querySelectorAll(".lib-card").length).toBe(50);
        expect(screen.getByText("会话列表加载中断，已显示部分数据")).toBeTruthy();
    });

    it("「包含消息内容」开关接线：正文命中并入结果（并集，f001）", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        // 会话 b 正文含「秘密词」，元信息不含。
        ub.sessionHistory.query.mockImplementation((_source: string, _env: string, id: string) =>
            Promise.resolve({
                messages:
                    id === "b"
                        ? [msg("m1", "user", "这里提到 秘密词 了", 1)]
                        : [msg("m1", "user", "无关内容", 1)],
                next_cursor: null,
            }),
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "秘密词" } });
        await waitFor(() => {
            expect(screen.getByText("会话 b")).toBeTruthy();
        });
        // 元信息命中 + 正文命中并集；纯正文命中会话 b 也显示。
        // 元信息命中在内容搜索开启后仍保留（f006）：改为仅元信息命中词，正文无命中。
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "会话 a" } });
        await waitFor(() => {
            expect(screen.getByText("会话 a")).toBeTruthy();
            expect(screen.queryByText("会话 b")).toBeNull();
        });
    });

    it("加载更多分页逐步加载", async () => {
        const ub = usageboard();
        const many = Array.from({ length: 60 }, (_, i) => sess(`s${String(i)}`, "claude_code"));
        ub.tokenStats.getSessions.mockResolvedValue(many);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 s0"));
        expect(document.querySelectorAll(".lib-card").length).toBe(50);
        fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
        await waitFor(() => {
            expect(document.querySelectorAll(".lib-card").length).toBe(60);
        });
    });

    it("预览抽屉「单独打开」装入并切页签，Esc 关闭", async () => {
        const ub = usageboard();
        const switch_fn = vi.fn();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "消息一", 1)],
            next_cursor: null,
        });
        await renderLibrary({ on_switch_workspace: switch_fn });
        await waitFor(() => screen.getByText("会话 a"));
        const preview_btns = screen.getAllByRole("button", { name: "预览" });
        const preview_btn = preview_btns[0];
        if (!preview_btn) throw new Error("preview button missing");
        fireEvent.click(preview_btn);
        await waitFor(() => {
            expect(document.querySelectorAll(".lib-preview-msg").length).toBe(1);
        });
        const preview_foot = document.querySelector(".lib-preview-foot");
        const open_btn = preview_foot?.querySelector<HTMLButtonElement>("button");
        if (!open_btn) throw new Error("preview open button missing");
        fireEvent.click(open_btn);
        expect(ub.sessionHistory.open).toHaveBeenCalled();
        expect(switch_fn).toHaveBeenCalled();
    });

    it("预览抽屉「加入选择」勾选/取消勾选会话（f005）", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        ub.sessionHistory.query.mockResolvedValue({
            messages: [msg("m1", "user", "消息一", 1)],
            next_cursor: null,
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        const preview_btns = screen.getAllByRole("button", { name: "预览" });
        const preview_btn = preview_btns[0];
        if (!preview_btn) throw new Error("preview button missing");
        fireEvent.click(preview_btn);
        await waitFor(() => {
            expect(document.querySelectorAll(".lib-preview-msg").length).toBe(1);
        });
        const add_btn = screen.getByRole("button", { name: "加入选择" });
        fireEvent.click(add_btn);
        expect(screen.getByText("1/8")).toBeTruthy();
        fireEvent.click(add_btn);
        expect(screen.queryByText("1/8")).toBeNull();
    });

    it("更新一张卡片摘要时，其余已渲染卡片不重渲染（t237）", () => {
        const s1 = sess("a", "claude_code") as unknown as TokenStatsSession;
        const s2 = sess("b", "opencode") as unknown as TokenStatsSession;
        const counts = { a: 0, b: 0 };
        const onRenderById: Record<string, () => void> = {
            a: () => {
                counts.a += 1;
            },
            b: () => {
                counts.b += 1;
            },
        };
        function getOnRender(id: string): () => void {
            return onRenderById[id] ?? (() => undefined);
        }
        const noop_toggle = vi.fn();
        const noop_preview = vi.fn();
        const noop_open = vi.fn();

        function Parent() {
            const [summaries, set_summaries] = useState<Record<string, string>>({});
            return (
                <div>
                    <button
                        type="button"
                        onClick={() => {
                            set_summaries((cur) => ({
                                ...cur,
                                [key_of(s2)]: "新摘要",
                            }));
                        }}
                    >
                        update
                    </button>
                    <SessionCard
                        s={s1}
                        summary={summaries[key_of(s1)] ?? ""}
                        selected={false}
                        on_toggle={noop_toggle}
                        on_preview={noop_preview}
                        on_open={noop_open}
                        onRender={getOnRender("a")}
                    />
                    <SessionCard
                        s={s2}
                        summary={summaries[key_of(s2)] ?? ""}
                        selected={false}
                        on_toggle={noop_toggle}
                        on_preview={noop_preview}
                        on_open={noop_open}
                        onRender={getOnRender("b")}
                    />
                </div>
            );
        }

        const { getByRole } = render(<Parent />);
        expect(counts).toEqual({ a: 1, b: 1 });

        fireEvent.click(getByRole("button", { name: "update" }));
        expect(counts).toEqual({ a: 1, b: 2 });
    });
});
