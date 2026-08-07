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
        searchContent: MockFn;
        summaries: MockFn;
        onMessagesUpdated: MockFn;
        onFocus: MockFn;
    };
    tokenStats: {
        open: MockFn;
        getSessions: MockFn;
        getSessionStats: MockFn;
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
): TokenStatsSession {
    return {
        id,
        source: source as TokenStatsSession["source"],
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

function session_at(index: number): TokenStatsSession {
    const session = SESSIONS[index];
    if (!session) throw new Error(`Missing fixture session at index ${String(index)}`);
    return session;
}

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

    it("t248 AC1/AC2：首屏只取 limit=50 一页，统计独立于列表请求", async () => {
        const ub = usageboard();
        const first_page = Array.from({ length: 50 }, (_, i) =>
            sess(`p${String(i)}`, "claude_code"),
        );
        let resolve_list!: (value: TokenStatsSession[]) => void;
        ub.tokenStats.getSessions
            .mockReturnValueOnce(
                new Promise<TokenStatsSession[]>((resolve) => {
                    resolve_list = resolve;
                }),
            )
            .mockImplementation(() => {
                throw new Error("unexpected second page request");
            });
        ub.tokenStats.getSessionStats.mockResolvedValue({ sessions: 73, agents: 4, tokens: 9876 });

        await renderLibrary();

        await waitFor(() => {
            expect(screen.getByText(/73 个会话/)).toBeTruthy();
        });
        expect(screen.queryByText("会话 p0")).toBeNull();
        expect(ub.tokenStats.getSessions).toHaveBeenCalledTimes(1);
        expect(ub.tokenStats.getSessions).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 50, offset: 0 }),
        );

        resolve_list(first_page);
        await waitFor(() => {
            expect(screen.getByText("会话 p0")).toBeTruthy();
        });
        expect(ub.tokenStats.getSessions).toHaveBeenCalledTimes(1);
    });

    it("t248 AC3/AC4：加载更多按页追加，筛选变化重置 offset 并传后端过滤", async () => {
        const ub = usageboard();
        const first_page = Array.from({ length: 50 }, (_, i) =>
            sess(`p${String(i)}`, i % 2 === 0 ? "claude_code" : "opencode"),
        );
        const second_page = [sess("p50", "opencode")];
        const filtered_page = [sess("needle", "opencode")];
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["search"] === "needle") return Promise.resolve(filtered_page);
            if (filters["offset"] === 50) return Promise.resolve(second_page);
            if (typeof filters["offset"] === "number" && filters["offset"] > 0) {
                return Promise.resolve([]);
            }
            return Promise.resolve(first_page);
        });

        await renderLibrary();
        await waitFor(() => {
            expect(screen.getByText("会话 p0")).toBeTruthy();
        });
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ limit: 50, offset: 0 }),
        );

        fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
        await waitFor(() => {
            expect(screen.getByText("会话 p50")).toBeTruthy();
        });
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ limit: 50, offset: 50 }),
        );

        fireEvent.change(screen.getByPlaceholderText(/搜索/), {
            target: { value: "needle" },
        });
        await waitFor(() => {
            expect(screen.getByText("会话 needle")).toBeTruthy();
        });
        expect(screen.queryByText("会话 p0")).toBeNull();
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ search: "needle", limit: 50, offset: 0 }),
        );
    });

    it("t248 AC4：Agent 与日期筛选均转为后端过滤参数", async () => {
        const ub = usageboard();
        const first_page = Array.from({ length: 2 }, (_, i) =>
            sess(`f${String(i)}`, i === 0 ? "claude_code" : "opencode"),
        );
        ub.tokenStats.getSessions.mockResolvedValue(first_page);
        await renderLibrary();
        await waitFor(() => {
            expect(screen.getByText("会话 f0")).toBeTruthy();
        });

        fireEvent.click(screen.getByRole("button", { name: /^OpenCode/ }));
        fireEvent.change(screen.getByLabelText("起始日期"), {
            target: { value: "2026-07-10" },
        });
        fireEvent.change(screen.getByLabelText("结束日期"), {
            target: { value: "2026-07-11" },
        });

        await waitFor(() => {
            expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    sources: ["opencode"],
                    start_at: expect.any(Number) as unknown,
                    end_at: expect.any(Number) as unknown,
                    limit: 50,
                    offset: 0,
                }),
            );
        });
    });

    it("t248 AC5：内容搜索把后端筛选交给 searchContent，不从 renderer 已加载页拼全集", async () => {
        const ub = usageboard();
        const hidden = sess("hidden", "opencode");
        const first_page = [sess("visible", "claude_code")];
        ub.tokenStats.getSessions.mockResolvedValue(first_page);
        ub.sessionHistory.searchContent.mockResolvedValue({
            hits: [key_of(hidden)],
            sessions: [hidden],
        });
        await renderLibrary();
        await waitFor(() => {
            expect(screen.getByText("会话 visible")).toBeTruthy();
        });

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), {
            target: { value: "秘密词" },
        });
        await waitFor(() => {
            expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(1);
        });
        const request = ub.sessionHistory.searchContent.mock.calls[0]?.[0] as unknown as Record<
            string,
            unknown
        >;
        expect(request).toMatchObject({
            keyword: "秘密词",
            filters: { search: "秘密词" },
        });
        expect(request).not.toHaveProperty("locs");
        await waitFor(() => {
            expect(screen.getByText("会话 hidden")).toBeTruthy();
        });
    });

    it("t248 AC6：摘要只请求当前可见页，不请求未加载会话", async () => {
        const ub = usageboard();
        const first_page = Array.from({ length: 50 }, (_, i) =>
            sess(`v${String(i)}`, "claude_code"),
        );
        const second_page = [sess("hidden", "claude_code")];
        ub.tokenStats.getSessions
            .mockResolvedValueOnce(first_page)
            .mockResolvedValueOnce(second_page);
        ub.sessionHistory.summaries.mockResolvedValue({});
        await renderLibrary();
        await waitFor(() => {
            expect(screen.getByText("会话 v0")).toBeTruthy();
        });
        await waitFor(() => {
            expect(ub.sessionHistory.summaries).toHaveBeenCalledTimes(1);
        });
        expect(
            (
                ub.sessionHistory.summaries.mock.calls[0]?.[0] as unknown as {
                    session_id: string;
                }[]
            ).some((loc) => loc.session_id === "hidden"),
        ).toBe(false);

        fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
        await waitFor(() => {
            expect(screen.getByText("会话 hidden")).toBeTruthy();
        });
        await waitFor(() => {
            expect(ub.sessionHistory.summaries).toHaveBeenCalledTimes(2);
        });
        expect(ub.sessionHistory.summaries.mock.calls[1]?.[0]).toEqual([
            expect.objectContaining({ session_id: "hidden" }),
        ]);
        expect(ub.sessionHistory.summaries.mock.calls[0]?.[0]).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ session_id: "hidden" })]),
        );
    });

    it("搜索框默认只匹配元信息，卡片显示 agent 色条/徽标/标题/轮数/tokens/目录", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["search"] === "proj/b") return Promise.resolve([session_at(1)]);
            return Promise.resolve(SESSIONS);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "proj/b" } });
        await waitFor(() => {
            expect(screen.getByText("会话 b")).toBeTruthy();
            expect(screen.queryByText("会话 a")).toBeNull();
        });
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
        ub.sessionHistory.summaries.mockResolvedValue({
            "claude_code|win|a": "真正要显示的用户消息",
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        await waitFor(() => {
            const card_summary = document.querySelector(".lib-card-summary")?.textContent;
            expect(card_summary).toContain("真正要显示的用户消息");
        });
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        await waitFor(() => {
            const row_summary = document.querySelector(".lib-row-summary")?.textContent;
            expect(row_summary).toContain("真正要显示的用户消息");
        });
    });

    it("agent 芯片多选过滤 + 排序 + 视图切换", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessionStats.mockResolvedValue({
            sessions: 3,
            agents: 3,
            tokens: 1125,
            source_counts: { claude_code: 1, opencode: 1, grok: 1 },
        });
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            const sources = filters["sources"] as string[] | undefined;
            if (sources?.includes("grok")) return Promise.resolve([session_at(2), session_at(0)]);
            if (sources?.includes("claude_code")) return Promise.resolve([session_at(0)]);
            return Promise.resolve(SESSIONS);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.click(screen.getByRole("button", { name: /^Claude/ }));
        await waitFor(() => {
            expect(screen.getByText("会话 a")).toBeTruthy();
            expect(screen.queryByText("会话 b")).toBeNull();
            expect(screen.queryByText("会话 c")).toBeNull();
        });
        fireEvent.click(screen.getByRole("button", { name: /^Grok/ }));
        await waitFor(() => {
            expect(screen.getByText("会话 c")).toBeTruthy();
            expect(screen.queryByText("会话 b")).toBeNull();
        });
        // 排序：calls desc → c 在前
        fireEvent.change(screen.getByLabelText("排序方式"), { target: { value: "calls" } });
        await waitFor(() => {
            const first_card = document.querySelector(".lib-card-title");
            expect(first_card?.textContent).toContain("会话 c");
        });
        // 列表视图
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        expect(document.querySelector(".lib-list")).toBeTruthy();
        const row = document.querySelector(".lib-row");
        expect(row?.querySelector(".lib-row-title")?.textContent).toContain("会话 c");
        expect(row?.querySelector(".lib-row-badge")?.textContent).toBe("G");
        expect(row?.querySelector(".lib-row-meta")?.textContent).toContain("9 轮");
        expect(row?.querySelector(".lib-row-dir")?.textContent).toContain("/proj/c");
    });

    it("普通分页切换 tokens/calls 时传递排序参数并展示后端顺序", async () => {
        const ub = usageboard();
        const low = sess("low", "claude_code", { calls: 2, input_tokens: 1 });
        const high = sess("high", "opencode", { calls: 8, input_tokens: 100 });
        const medium = sess("medium", "grok", { calls: 12, input_tokens: 50 });
        const unsorted = [low, high, medium];
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["order_by"] === "tokens") {
                return Promise.resolve([high, medium, low]);
            }
            if (filters["order_by"] === "calls") {
                return Promise.resolve([medium, high, low]);
            }
            return Promise.resolve(unsorted);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 low"));

        const card_titles = (): (string | null)[] =>
            Array.from(document.querySelectorAll(".lib-card-title"), (node) => node.textContent);
        fireEvent.change(screen.getByLabelText("排序方式"), { target: { value: "tokens" } });
        await waitFor(() => {
            expect(card_titles()).toEqual(["会话 high", "会话 medium", "会话 low"]);
        });
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({
                order_by: "tokens",
                direction: "desc",
                limit: 50,
                offset: 0,
            }),
        );

        fireEvent.change(screen.getByLabelText("排序方式"), { target: { value: "calls" } });
        await waitFor(() => {
            expect(card_titles()).toEqual(["会话 medium", "会话 high", "会话 low"]);
        });
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({
                order_by: "calls",
                direction: "desc",
                limit: 50,
                offset: 0,
            }),
        );
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
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) =>
            filters["start_at"] !== undefined
                ? Promise.resolve([newer])
                : Promise.resolve([older, newer]),
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 new"));
        fireEvent.change(screen.getByLabelText("起始日期"), { target: { value: "2026-07-10" } });
        await waitFor(() => {
            expect(screen.queryByText("会话 old")).toBeNull();
            expect(screen.getByText("会话 new")).toBeTruthy();
        });
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
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) =>
            filters["end_at"] !== undefined
                ? Promise.resolve([older])
                : Promise.resolve([older, newer]),
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 new"));
        fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-07-09" } });
        await waitFor(() => {
            expect(screen.getByText("会话 old")).toBeTruthy();
            expect(screen.queryByText("会话 new")).toBeNull();
        });
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
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) =>
            filters["search"] === "不存在" ? Promise.resolve([]) : Promise.resolve(SESSIONS),
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "不存在" } });
        await waitFor(() => {
            expect(screen.getByText("没有匹配的会话")).toBeTruthy();
            expect(screen.getByText(/清除筛选/)).toBeTruthy();
        });
    });

    it("加载失败且筛选 0 条时显示加载失败并保留清除筛选", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockRejectedValue(new Error("boom"));
        await renderLibrary();
        await waitFor(() => screen.getByText("会话列表加载失败"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "x" } });
        await waitFor(() => {
            expect(screen.getByText("会话列表加载失败")).toBeTruthy();
        });
        expect(screen.getByText(/清除筛选/)).toBeTruthy();
    });

    it("筛选首屏请求失败时不展示上一筛选的会话", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions
            .mockResolvedValueOnce(SESSIONS)
            .mockRejectedValueOnce(new Error("filtered page failed"));
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "失败筛选" } });
        await waitFor(() => {
            expect(screen.getByText("会话列表加载失败")).toBeTruthy();
        });
        expect(screen.queryByText("会话 a")).toBeNull();
    });

    it("t248 AC3：加载更多追加到短页后按钮消失，快速双击不重复请求", async () => {
        const ub = usageboard();
        const first = Array.from({ length: 50 }, (_, i) => sess(`p${String(i)}`, "claude_code"));
        const second = [sess("p50", "claude_code"), sess("p51", "claude_code")];
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["offset"] === 50) return Promise.resolve(second);
            if (typeof filters["offset"] === "number" && filters["offset"] > 0) {
                return Promise.resolve([]);
            }
            return Promise.resolve(first);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 p0"));

        const button = screen.getByRole("button", { name: "加载更多" });
        fireEvent.click(button);
        fireEvent.click(button);
        await waitFor(() => {
            expect(screen.getByText("会话 p51")).toBeTruthy();
            expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
        });
        expect(document.querySelectorAll(".lib-card").length).toBe(52);
        expect(
            ub.tokenStats.getSessions.mock.calls.filter(
                (call) => (call[0] as { offset?: number }).offset === 50,
            ),
        ).toHaveLength(1);
        expect(ub.tokenStats.getSessions).toHaveBeenCalledTimes(2);
    });

    it("中途分页失败时保留首屏数据并显示加载中断提示", async () => {
        const ub = usageboard();
        const first = Array.from({ length: 50 }, (_, i) => sess(`p${String(i)}`, "claude_code"));
        ub.tokenStats.getSessions
            .mockResolvedValueOnce(first)
            .mockRejectedValueOnce(new Error("boom"));
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 p0"));
        expect(document.querySelectorAll(".lib-card").length).toBe(50);

        fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
        await waitFor(() => {
            expect(screen.getByText("会话列表加载中断，已显示部分数据")).toBeTruthy();
        });
        expect(document.querySelectorAll(".lib-card").length).toBe(50);
    });

    it("筛选切换期间旧分页请求不会释放新列表的并发锁", async () => {
        const ub = usageboard();
        const first = Array.from({ length: 50 }, (_, i) => sess(`p${String(i)}`, "claude_code"));
        const filtered_first = Array.from({ length: 50 }, (_, i) =>
            sess(`needle${String(i)}`, "opencode"),
        );
        const filtered_second = [sess("needle50", "opencode")];
        let resolve_old!: (value: TokenStatsSession[]) => void;
        let resolve_new!: (value: TokenStatsSession[]) => void;
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            const offset = filters["offset"];
            if (filters["search"] === "needle" && offset === 50) {
                return new Promise<TokenStatsSession[]>((resolve) => {
                    resolve_new = resolve;
                });
            }
            if (offset === 50) {
                return new Promise<TokenStatsSession[]>((resolve) => {
                    resolve_old = resolve;
                });
            }
            if (filters["search"] === "needle") return Promise.resolve(filtered_first);
            return Promise.resolve(first);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 p0"));

        fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "needle" } });
        await waitFor(() => screen.getByText("会话 needle0"));

        fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
        await waitFor(() => {
            expect(
                ub.tokenStats.getSessions.mock.calls.filter(
                    (call) => (call[0] as { offset?: number }).offset === 50,
                ),
            ).toHaveLength(2);
        });

        resolve_old(first);
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByRole("button", { name: "加载更多" })).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
        expect(
            ub.tokenStats.getSessions.mock.calls.filter(
                (call) => (call[0] as { offset?: number }).offset === 50,
            ),
        ).toHaveLength(2);

        resolve_new(filtered_second);
        await waitFor(() => screen.getByText("会话 needle50"));
    });

    it("「包含消息内容」开关接线：正文命中并入结果（并集，f001）", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        ub.sessionHistory.searchContent.mockImplementation((request: Record<string, unknown>) => {
            const keyword = request["keyword"];
            if (keyword === "秘密词") {
                return Promise.resolve({
                    hits: [key_of(session_at(1))],
                    sessions: [session_at(1)],
                });
            }
            if (keyword === "会话 a") {
                return Promise.resolve({ hits: [], sessions: [session_at(0)] });
            }
            return Promise.resolve({ hits: [], sessions: [] });
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "秘密词" } });
        await waitFor(() => {
            expect(screen.getByText("会话 b")).toBeTruthy();
        });
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "会话 a" } });
        await waitFor(() => {
            expect(screen.getByText("会话 a")).toBeTruthy();
            expect(screen.queryByText("会话 b")).toBeNull();
        });
    });

    it("内容搜索结果遵循 tokens/earliest 排序并随切换重新渲染", async () => {
        const ub = usageboard();
        const low = sess("low", "claude_code", { input_tokens: 1, started_at: T0 });
        const high = sess("high", "opencode", { input_tokens: 100, started_at: T0 + 2000 });
        const medium = sess("medium", "grok", { input_tokens: 50, started_at: T0 + 1000 });
        ub.tokenStats.getSessions.mockResolvedValue([]);
        ub.sessionHistory.searchContent.mockResolvedValue({
            hits: [],
            sessions: [low, high, medium],
        });
        await renderLibrary();

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "关键词" } });
        await waitFor(() => {
            expect(screen.getAllByText(/会话 (low|high|medium)/)).toHaveLength(3);
        });

        const card_titles = (): (string | null)[] =>
            Array.from(document.querySelectorAll(".lib-card-title"), (node) => node.textContent);
        fireEvent.change(screen.getByLabelText("排序方式"), { target: { value: "tokens" } });
        await waitFor(() => {
            expect(card_titles()).toEqual(["会话 high", "会话 medium", "会话 low"]);
        });

        fireEvent.change(screen.getByLabelText("排序方式"), { target: { value: "earliest" } });
        await waitFor(() => {
            expect(card_titles()).toEqual(["会话 low", "会话 medium", "会话 high"]);
        });
    });

    it("getSessionStats 失败时不显示首屏部分统计或 source chips", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue([sess("partial", "claude_code")]);
        ub.tokenStats.getSessionStats.mockRejectedValue(new Error("stats unavailable"));
        await renderLibrary();

        await waitFor(() => {
            expect(screen.getByText("统计不可用")).toBeTruthy();
        });
        expect(screen.queryByText(/1 个会话/)).toBeNull();
        expect(document.querySelectorAll(".lib-agent-chip")).toHaveLength(1);
        expect(screen.queryByRole("button", { name: /^Claude/ })).toBeNull();
    });
    it("内容搜索防抖：快速输入两次只触发一次 searchContent（t239）", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        ub.sessionHistory.searchContent.mockResolvedValue([]);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "密" } });
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "秘密" } });

        expect(ub.sessionHistory.searchContent).not.toHaveBeenCalled();
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(1);
        expect(ub.sessionHistory.searchContent).toHaveBeenLastCalledWith(
            expect.objectContaining({ keyword: "秘密" }),
        );
        vi.useRealTimers();
    });

    it("内容搜索失败时清空上一关键词结果并提示错误", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        ub.sessionHistory.searchContent
            .mockResolvedValueOnce({ hits: [key_of(session_at(0))], sessions: [session_at(0)] })
            .mockRejectedValueOnce(new Error("search failed"));
        await renderLibrary();

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "旧关键词" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        await waitFor(() => {
            expect(screen.getByText("会话 a")).toBeTruthy();
        });

        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "新关键词" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        await waitFor(() => {
            expect(screen.getByText("消息内容搜索失败")).toBeTruthy();
        });
        expect(screen.queryByText("会话 a")).toBeNull();
        vi.useRealTimers();
    });

    it("内容搜索切换关键词时丢弃旧查询结果（t239）", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        let resolve_first: (value: {
            hits: string[];
            sessions: TokenStatsSession[];
        }) => void = () => undefined;
        ub.sessionHistory.searchContent.mockImplementation((request: Record<string, unknown>) => {
            const keyword = request["keyword"];
            if (keyword === "旧") {
                return new Promise<{ hits: string[]; sessions: TokenStatsSession[] }>((resolve) => {
                    resolve_first = resolve;
                });
            }
            if (keyword === "新") {
                return Promise.resolve({
                    hits: [key_of(session_at(1))],
                    sessions: [session_at(1)],
                });
            }
            return Promise.resolve({ hits: [], sessions: [] });
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "旧" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        // 旧查询仍在 pending
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(1);

        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "新" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(2);

        // 旧查询现在才 resolve，应被丢弃（不覆盖新结果）。
        resolve_first({ hits: [key_of(session_at(0))], sessions: [session_at(0)] });
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByText("会话 a")).toBeNull();
        expect(screen.getByText("会话 b")).toBeTruthy();
        vi.useRealTimers();
    });

    it("批量摘要：一次 summaries 更新全部可见卡片（t239）", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        ub.sessionHistory.summaries.mockResolvedValue({
            "claude_code|win|a": "摘要 a",
            "opencode|win|b": "摘要 b",
            "grok|win|c": "摘要 c",
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        await waitFor(() => {
            expect(ub.sessionHistory.summaries).toHaveBeenCalledTimes(1);
        });
        expect(ub.sessionHistory.summaries).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ source: "claude_code", env: "win", session_id: "a" }),
                expect.objectContaining({ source: "opencode", env: "win", session_id: "b" }),
                expect.objectContaining({ source: "grok", env: "win", session_id: "c" }),
            ]),
        );
        expect(ub.sessionHistory.query).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(document.querySelector(".lib-card-summary")?.textContent).toContain("摘要 a");
        });
    });

    it("加载更多分页逐步加载", async () => {
        const ub = usageboard();
        const many = Array.from({ length: 60 }, (_, i) => sess(`s${String(i)}`, "claude_code"));
        ub.tokenStats.getSessions
            .mockResolvedValueOnce(many.slice(0, 50))
            .mockResolvedValueOnce(many.slice(50));
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
        const s1 = sess("a", "claude_code");
        const s2 = sess("b", "opencode");
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
