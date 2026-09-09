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
 * SelectionDock 并排打开、空态、加载更多（t328 起改无限滚动）。
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

async function renderLibrary(
    props: { on_switch_workspace?: () => void; on_clear_workspace?: () => void } = {},
) {
    const result = render(
        <SessionLibrary
            on_switch_workspace={props.on_switch_workspace ?? (() => undefined)}
            on_clear_workspace={props.on_clear_workspace ?? (() => undefined)}
        />,
    );
    await act(async () => {
        // 冲刷 getSessions/query resolve 等微任务，避免 act 警告。
    });
    return result;
}

function grid(): Element | null {
    return document.querySelector('[data-testid="library-grid"]');
}

function list(): Element | null {
    return document.querySelector('[data-testid="library-list"]');
}

/** 滚动容器触底（t328 无限滚动）。jsdom 下 scrollHeight/clientHeight 均为 0，
 *  触底条件（scrollTop+clientHeight >= scrollHeight-阈值）对任意 scroll 事件恒真。 */
function scroll_to_bottom(container: Element | null): void {
    if (!container) throw new Error("滚动容器缺失，是否处于空态？");
    fireEvent.scroll(container);
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
        env: "linux",
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

        scroll_to_bottom(grid());
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

    it("t328 AC-002 test f001：非底部滚动不触发加载", async () => {
        const ub = usageboard();
        const first_page = Array.from({ length: 50 }, (_, i) =>
            sess(`p${String(i)}`, "claude_code"),
        );
        ub.tokenStats.getSessions.mockResolvedValue(first_page);
        await renderLibrary();
        await waitFor(() => {
            expect(screen.getByText("会话 p0")).toBeTruthy();
        });
        const calls_before = ub.tokenStats.getSessions.mock.calls.length;
        // 模拟未触底滚动：jsdom 无布局，用 scrollTop/clientHeight 手动设非底部。
        const container = grid();
        if (!container) throw new Error("滚动容器缺失");
        Object.defineProperty(container, "scrollTop", { value: 0, configurable: true });
        Object.defineProperty(container, "clientHeight", { value: 100, configurable: true });
        Object.defineProperty(container, "scrollHeight", { value: 1000, configurable: true });
        fireEvent.scroll(container);
        expect(ub.tokenStats.getSessions.mock.calls.length).toBe(calls_before);
    });

    it("t328 AC-005 test f002：筛选重置后触底继续加载（offset 归 0 后再次滚底加载第 2 页）", async () => {
        const ub = usageboard();
        const first_page = Array.from({ length: 50 }, (_, i) =>
            sess(`p${String(i)}`, "claude_code"),
        );
        const second_page = [sess("p50", "claude_code")];
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["offset"] === 50) return Promise.resolve(second_page);
            return Promise.resolve(first_page);
        });
        await renderLibrary();
        await waitFor(() => {
            expect(screen.getByText("会话 p0")).toBeTruthy();
        });

        // 搜索重置（触发 has_more 重置）
        fireEvent.change(screen.getByPlaceholderText(/搜索/), {
            target: { value: "zz" },
        });
        await waitFor(() => {
            expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
                expect.objectContaining({ offset: 0 }),
            );
        });

        // 重置后滚到底应继续加载第 2 页
        scroll_to_bottom(grid());
        await waitFor(() => {
            expect(screen.getByText("会话 p50")).toBeTruthy();
        });
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
        fireEvent.click(screen.getByTestId("time-preset-30d"));

        await waitFor(() => {
            expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    sources: ["opencode"],
                    start_at: expect.any(Number) as unknown,
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
        // t263: 取消信号传入搜索调用（web shim 透传 fetch，服务端断连中止）。
        const signal: unknown = ub.sessionHistory.searchContent.mock.calls[0]?.[1];
        expect(signal).toBeInstanceOf(AbortSignal);
        await waitFor(() => {
            expect(screen.getByText("会话 hidden")).toBeTruthy();
        });
    });

    it("t438 AC-007：未勾选「包含消息内容」时文案说明搜索范围（标题/目录/会话 ID）", async () => {
        await renderLibrary();
        const input = screen.getByPlaceholderText(/搜索/);
        // 未勾选：范围 = 标题 / 目录 / 会话 ID。
        expect(input.getAttribute("placeholder")).toBe("搜索标题 / 目录 / 会话 ID");
        // 勾选「包含消息内容」：文案切换为说明包含消息内容。
        fireEvent.click(screen.getByLabelText("包含消息内容"));
        expect(screen.getByPlaceholderText(/搜索/).getAttribute("placeholder")).toBe(
            "搜索消息内容（含标题 / 目录 / 会话 ID）",
        );
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

        scroll_to_bottom(grid());
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
        const card = document.querySelector('[data-testid="library-card"]');
        expect(card).toBeTruthy();
        expect(card?.querySelector('[data-testid="library-card-accent"]')).toBeTruthy();
        // t326：徽标为 VendorMark logo，不再渲染 agent 字母缩写。
        expect(
            card
                ?.querySelector('[data-testid="library-card-badge"]')
                ?.querySelector('[data-testid="vendor-mark"]'),
        ).toBeTruthy();
        expect(card?.querySelector('[data-testid="library-card-badge"]')?.textContent ?? "").toBe(
            "",
        );
        // t326：第三行渲染会话名。
        expect(card?.querySelector('[data-testid="library-card-title"]')?.textContent).toContain(
            "会话 b",
        );
        // t326：摘要行（line-clamp-2）已移除。
        expect(card?.querySelector(".library-card-summary")).toBeNull();
        // t326：第二行渲染轮次/tokens/session id。
        expect(card?.querySelector('[data-testid="library-card-meta"]')?.textContent).toContain(
            "2 轮",
        );
        expect(card?.querySelector('[data-testid="library-card-meta"]')?.textContent).toContain(
            "375 tokens",
        );
        expect(card?.querySelector('[data-testid="library-card-meta"]')?.textContent).toContain(
            "b",
        );
        // t326：第一行只显示目录末级，不再渲染完整路径。
        expect(card?.querySelector('[data-testid="library-card-cwd"]')?.textContent).toBe("b");
        expect(card?.querySelector('[data-testid="library-card-top"]')?.textContent).not.toContain(
            "/proj/b",
        );
    });

    it("行摘要取首条用户消息内容（f008）；卡片摘要行已移除（t326 AC-003）", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue([sess("a", "claude_code")]);
        ub.sessionHistory.summaries.mockResolvedValue({
            "claude_code|linux|a": "真正要显示的用户消息",
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));
        // t326：卡片不再渲染摘要行。
        expect(document.querySelector(".library-card-summary")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        await waitFor(() => {
            const row_summary = document.querySelector(
                '[data-testid="library-row-summary"]',
            )?.textContent;
            expect(row_summary).toContain("真正要显示的用户消息");
        });
    });

    it("agent logo 多选过滤 + 排序 + 视图切换", async () => {
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
        fireEvent.click(screen.getByRole("button", { name: "轮次最多" }));
        await waitFor(() => {
            const first_card = document.querySelector('[data-testid="library-card-title"]');
            expect(first_card?.textContent).toContain("会话 c");
        });
        // 列表视图
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        expect(document.querySelector('[data-testid="library-list"]')).toBeTruthy();
        const row = document.querySelector('[data-testid="library-row"]');
        expect(row?.querySelector('[data-testid="library-row-title"]')?.textContent).toContain(
            "会话 c",
        );
        expect(row?.querySelector('[data-testid="library-row-badge"]')?.textContent).toBe("G");
        expect(row?.querySelector('[data-testid="library-row-meta"]')?.textContent).toContain(
            "9 轮",
        );
        expect(row?.querySelector('[data-testid="library-row-dir"]')?.textContent).toContain(
            "/proj/c",
        );
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
            Array.from(
                document.querySelectorAll('[data-testid="library-card-title"]'),
                (node) => node.textContent,
            );
        fireEvent.click(screen.getByRole("button", { name: "Token 最多" }));
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

        fireEvent.click(screen.getByRole("button", { name: "轮次最多" }));
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

    it("时间预设过滤：活动时间结束于回看窗口之前的会话被排除（f002）", async () => {
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
        fireEvent.click(screen.getByTestId("time-preset-30d"));
        await waitFor(() => {
            expect(screen.queryByText("会话 old")).toBeNull();
            expect(screen.getByText("会话 new")).toBeTruthy();
        });
    });

    it("自定义时间区间过滤：活动时间起始于结束时刻之后的会话被排除（f002）", async () => {
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
        fireEvent.click(screen.getByRole("button", { name: "📅 自定义" }));
        fireEvent.change(screen.getByLabelText("开始"), { target: { value: "2026-07-01T00:00" } });
        fireEvent.change(screen.getByLabelText("结束"), { target: { value: "2026-07-09T23:59" } });
        fireEvent.click(screen.getByRole("button", { name: "应用" }));
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
            expect(document.querySelectorAll('[data-testid="preview-message"]').length).toBe(5);
        });
        expect(
            document.querySelectorAll('[data-testid="preview-message"]')[4]?.textContent,
        ).toContain("消息五");
        fireEvent.keyDown(window, { key: "Escape" });
        expect(document.querySelector('[data-testid="preview-panel"]')).toBeNull();
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

    it("t328 AC-003/AC-004：滚到底自动加载，重复触底不并发重复请求，has_more=false 后停止", async () => {
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

        // AC-001：无「加载更多」按钮。
        expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();

        // AC-004：连续两次触底，offset=50 仅请求一次（并发锁）。
        const container = grid();
        scroll_to_bottom(container);
        scroll_to_bottom(container);
        await waitFor(() => {
            expect(screen.getByText("会话 p51")).toBeTruthy();
        });
        expect(document.querySelectorAll('[data-testid="library-card"]').length).toBe(52);
        expect(
            ub.tokenStats.getSessions.mock.calls.filter(
                (call) => (call[0] as { offset?: number }).offset === 50,
            ),
        ).toHaveLength(1);
        expect(ub.tokenStats.getSessions).toHaveBeenCalledTimes(2);

        // AC-003：末页 2 条 < 50 → has_more=false，再次触底不再发起请求。
        scroll_to_bottom(container);
        await act(async () => {
            await Promise.resolve();
        });
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
        expect(document.querySelectorAll('[data-testid="library-card"]').length).toBe(50);

        scroll_to_bottom(grid());
        await waitFor(() => {
            expect(screen.getByText("会话列表加载中断，已显示部分数据")).toBeTruthy();
        });
        expect(document.querySelectorAll('[data-testid="library-card"]').length).toBe(50);
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

        scroll_to_bottom(grid());
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "needle" } });
        await waitFor(() => screen.getByText("会话 needle0"));

        scroll_to_bottom(grid());
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
        // 旧请求 resolve 不释放新列表的并发锁：再触底仍不发起第三个 offset=50 请求。
        scroll_to_bottom(grid());
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
            Array.from(
                document.querySelectorAll('[data-testid="library-card-title"]'),
                (node) => node.textContent,
            );
        fireEvent.click(screen.getByRole("button", { name: "Token 最多" }));
        await waitFor(() => {
            expect(card_titles()).toEqual(["会话 high", "会话 medium", "会话 low"]);
        });

        fireEvent.click(screen.getByRole("button", { name: "最早创建" }));
        await waitFor(() => {
            expect(card_titles()).toEqual(["会话 low", "会话 medium", "会话 high"]);
        });
    });

    it("t388 AC-003: 搜索响应 truncated=true 时展示降级提示", async () => {
        const ub = usageboard();
        const hit = sess("hit", "claude_code");
        ub.tokenStats.getSessions.mockResolvedValue([]);
        ub.sessionHistory.searchContent.mockResolvedValue({
            hits: [key_of(hit)],
            sessions: [hit],
            truncated: true,
        });
        await renderLibrary();

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "关键词" } });
        await waitFor(() => {
            expect(screen.getByTestId("search-truncated-hint")).toBeInTheDocument();
        });
        expect(screen.getByTestId("search-truncated-hint").textContent).toContain("结果已截断");
    });

    it("t388 AC-002 负向: 搜索响应 truncated=false 时不展示降级提示", async () => {
        const ub = usageboard();
        const hit = sess("hit", "claude_code");
        ub.tokenStats.getSessions.mockResolvedValue([]);
        ub.sessionHistory.searchContent.mockResolvedValue({
            hits: [key_of(hit)],
            sessions: [hit],
            truncated: false,
        });
        await renderLibrary();

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "关键词" } });
        await waitFor(() => {
            expect(screen.getByText("会话 hit")).toBeTruthy();
        });
        expect(screen.queryByTestId("search-truncated-hint")).not.toBeInTheDocument();
    });

    it("getSessionStats 失败时不显示首屏部分统计或 agent logo 行", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue([sess("partial", "claude_code")]);
        ub.tokenStats.getSessionStats.mockRejectedValue(new Error("stats unavailable"));
        await renderLibrary();

        await waitFor(() => {
            expect(screen.getByText("统计不可用")).toBeTruthy();
        });
        expect(screen.queryByText(/1 个会话/)).toBeNull();
        expect(document.querySelectorAll('[data-testid^="library-agent-logo-"]')).toHaveLength(0);
        expect(screen.queryByRole("button", { name: /^Claude/ })).toBeNull();
    });
    it("t404 AC-001/002：内容搜索分块进度文案与增量结果", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        const first_hit = sess("first", "claude_code");
        const second_hit = sess("second", "opencode");
        ub.tokenStats.getSessions.mockResolvedValue([]);
        let resolve_second: (value: {
            hits: string[];
            sessions: TokenStatsSession[];
            truncated: boolean;
            progress: {
                scanned: number;
                total: number;
                done: boolean;
                next_offset: number;
            };
        }) => void = () => undefined;
        ub.sessionHistory.searchContent
            .mockResolvedValueOnce({
                hits: [key_of(first_hit)],
                sessions: [first_hit],
                truncated: false,
                progress: { scanned: 64, total: 128, done: false, next_offset: 64 },
            })
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolve_second = resolve;
                    }),
            );
        await renderLibrary();

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "启用" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });

        // 首批到达、第二批挂起：进度 N/M + 增量结果（全量未完成）。
        await waitFor(() => {
            expect(screen.getByTestId("content-search-progress").textContent).toMatch(
                /已扫描 64\/128/,
            );
            expect(screen.getByText("会话 first")).toBeTruthy();
        });
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledWith(
            expect.objectContaining({
                keyword: "启用",
                offset: 0,
                limit: 64,
            }),
            expect.any(AbortSignal),
        );
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(2);
        expect(ub.sessionHistory.searchContent).toHaveBeenLastCalledWith(
            expect.objectContaining({ offset: 64, limit: 64, keyword: "启用" }),
            expect.any(AbortSignal),
        );

        resolve_second({
            hits: [key_of(second_hit)],
            sessions: [second_hit],
            truncated: false,
            progress: { scanned: 128, total: 128, done: true, next_offset: 128 },
        });
        await act(async () => {
            await Promise.resolve();
        });
        await waitFor(() => {
            expect(screen.getByText("会话 second")).toBeTruthy();
            expect(screen.getByText("会话 first")).toBeTruthy();
            expect(screen.queryByTestId("content-search-progress")).toBeNull();
        });
        vi.useRealTimers();
    });

    it("t404 AC-005：切换关键词中止未完成分块循环，不继续后续 offset", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        let resolve_first_batch: (value: {
            hits: string[];
            sessions: TokenStatsSession[];
            truncated: boolean;
            progress: {
                scanned: number;
                total: number;
                done: boolean;
                next_offset: number;
            };
        }) => void = () => undefined;
        ub.sessionHistory.searchContent.mockImplementation(
            (request: Record<string, unknown>, signal?: AbortSignal) => {
                const keyword = request["keyword"];
                if (keyword === "旧" && request["offset"] === 0) {
                    return new Promise((resolve, reject) => {
                        const on_abort = (): void => {
                            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
                        };
                        if (signal?.aborted) {
                            on_abort();
                            return;
                        }
                        signal?.addEventListener("abort", on_abort, { once: true });
                        resolve_first_batch = (value) => {
                            signal?.removeEventListener("abort", on_abort);
                            resolve(value);
                        };
                    });
                }
                if (keyword === "新") {
                    return Promise.resolve({
                        hits: [key_of(session_at(1))],
                        sessions: [session_at(1)],
                        truncated: false,
                        progress: { scanned: 1, total: 1, done: true, next_offset: 1 },
                    });
                }
                // 旧词第二批不应被调用。
                return Promise.resolve({
                    hits: [key_of(session_at(0))],
                    sessions: [session_at(0)],
                    truncated: false,
                    progress: { scanned: 128, total: 128, done: true, next_offset: 128 },
                });
            },
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "旧" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(1);

        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "新" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        await waitFor(() => {
            expect(screen.getByText("会话 b")).toBeTruthy();
        });
        // 旧词仅首批挂起后被 abort，不应出现 offset=64 的旧词调用。
        const old_offsets = ub.sessionHistory.searchContent.mock.calls
            .filter((call) => (call[0] as { keyword?: string }).keyword === "旧")
            .map((call) => (call[0] as { offset?: number }).offset);
        expect(old_offsets).toEqual([0]);
        // 晚到的旧批 resolve 不得覆盖新结果。
        resolve_first_batch({
            hits: [key_of(session_at(0))],
            sessions: [session_at(0)],
            truncated: false,
            progress: { scanned: 64, total: 128, done: false, next_offset: 64 },
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.queryByText("会话 a")).toBeNull();
        expect(screen.getByText("会话 b")).toBeTruthy();
        vi.useRealTimers();
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
            // t263: 取消信号随请求传入（web shim 透传 fetch，服务端断连中止）。
            expect.any(AbortSignal),
        );
        vi.useRealTimers();
    });

    it("t263 AC4：内容搜索已触发后再次输入，前序请求 signal 置为 aborted", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        // 挂起首请求 pending，捕获其 signal。
        let first_signal: AbortSignal | undefined;
        ub.sessionHistory.searchContent.mockImplementation(
            (_req: unknown, signal?: AbortSignal) => {
                first_signal = signal;
                return new Promise(() => {
                    /* 挂起，模拟 in-flight */
                });
            },
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "秘密词" } });
        // 首次防抖触发 → 搜索 A in-flight。
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(1);
        const first_call_signal = first_signal;
        expect(first_call_signal).toBeInstanceOf(AbortSignal);

        // 防抖窗口外再次输入 → 前序请求被 abort。
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "秘密词2" } });
        await act(async () => {
            vi.advanceTimersByTime(400);
            await Promise.resolve();
        });
        expect(first_call_signal?.aborted).toBe(true);
        expect(ub.sessionHistory.searchContent).toHaveBeenCalledTimes(2);
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
            "claude_code|linux|a": "摘要 a",
            "opencode|linux|b": "摘要 b",
            "grok|linux|c": "摘要 c",
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        await waitFor(() => {
            expect(ub.sessionHistory.summaries).toHaveBeenCalledTimes(1);
        });
        expect(ub.sessionHistory.summaries).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ source: "claude_code", env: "linux", session_id: "a" }),
                expect.objectContaining({ source: "opencode", env: "linux", session_id: "b" }),
                expect.objectContaining({ source: "grok", env: "linux", session_id: "c" }),
            ]),
        );
        expect(ub.sessionHistory.query).not.toHaveBeenCalled();
        // t326：卡片摘要行已移除，摘要改由列表行呈现（AC-003）。
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        await waitFor(() => {
            expect(
                document.querySelector('[data-testid="library-row-summary"]')?.textContent,
            ).toContain("摘要 a");
        });
    });

    it("t328 AC-002：滚到底自动加载下一页并追加（无需点击）", async () => {
        const ub = usageboard();
        const many = Array.from({ length: 60 }, (_, i) => sess(`s${String(i)}`, "claude_code"));
        ub.tokenStats.getSessions
            .mockResolvedValueOnce(many.slice(0, 50))
            .mockResolvedValueOnce(many.slice(50));
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 s0"));
        expect(document.querySelectorAll('[data-testid="library-card"]').length).toBe(50);
        scroll_to_bottom(grid());
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="library-card"]').length).toBe(60);
        });
    });

    it("t328 AC-001/AC-006：网格与列表视图均无「加载更多」按钮，列表触底同样自动加载", async () => {
        const ub = usageboard();
        const first = Array.from({ length: 50 }, (_, i) => sess(`p${String(i)}`, "claude_code"));
        const second = Array.from({ length: 50 }, (_, i) => sess(`q${String(i)}`, "claude_code"));
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["offset"] === 50) return Promise.resolve(second);
            if (typeof filters["offset"] === "number" && filters["offset"] > 0) {
                return Promise.resolve([]);
            }
            return Promise.resolve(first);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 p0"));

        // 网格视图：无按钮（AC-001）。
        expect(grid()).toBeTruthy();
        expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();

        // 列表视图：无按钮，触底同样自动加载（AC-006）。
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        await waitFor(() => {
            expect(list()).toBeTruthy();
        });
        expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull();
        expect(document.querySelectorAll('[data-testid="library-row"]').length).toBe(50);

        scroll_to_bottom(list());
        await waitFor(() => {
            expect(screen.getByText("会话 q0")).toBeTruthy();
        });
        expect(document.querySelectorAll('[data-testid="library-row"]').length).toBe(100);
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ limit: 50, offset: 50 }),
        );
    });

    it("t328 AC-005：搜索重置后触底继续自动加载（has_more 重置）", async () => {
        const ub = usageboard();
        const first = Array.from({ length: 50 }, (_, i) => sess(`p${String(i)}`, "claude_code"));
        const second = Array.from({ length: 50 }, (_, i) => sess(`q${String(i)}`, "claude_code"));
        const filtered_first = Array.from({ length: 50 }, (_, i) =>
            sess(`needle${String(i)}`, "claude_code"),
        );
        const filtered_second = [sess("needle50", "claude_code")];
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["search"] === "needle" && filters["offset"] === 50) {
                return Promise.resolve(filtered_second);
            }
            if (filters["search"] === "needle") return Promise.resolve(filtered_first);
            if (filters["offset"] === 50) return Promise.resolve(second);
            return Promise.resolve(first);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 p0"));

        // 普通模式滚到底 → 第二页，has_more 保持 true。
        scroll_to_bottom(grid());
        await waitFor(() => screen.getByText("会话 q0"));

        // 搜索重置 → 首屏 50 条、has_more 重置为 true → 触底继续加载下一页。
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "needle" } });
        await waitFor(() => screen.getByText("会话 needle0"));
        scroll_to_bottom(grid());
        await waitFor(() => screen.getByText("会话 needle50"));
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ search: "needle", limit: 50, offset: 50 }),
        );
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
            expect(document.querySelectorAll('[data-testid="preview-message"]').length).toBe(1);
        });
        const preview_foot = document.querySelector('[data-testid="preview-footer"]');
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
            expect(document.querySelectorAll('[data-testid="preview-message"]').length).toBe(1);
        });
        const add_btn = screen.getByRole("button", { name: "加入选择" });
        fireEvent.click(add_btn);
        expect(screen.getByText("1/8")).toBeTruthy();
        fireEvent.click(add_btn);
        expect(screen.queryByText("1/8")).toBeNull();
    });

    it("更新一张卡片选中态时，其余已渲染卡片不重渲染（t237）", () => {
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
            const [selected_b, set_selected_b] = useState(false);
            return (
                <div>
                    <button
                        type="button"
                        onClick={() => {
                            set_selected_b((v) => !v);
                        }}
                    >
                        update
                    </button>
                    <SessionCard
                        s={s1}
                        selected={false}
                        on_toggle={noop_toggle}
                        on_preview={noop_preview}
                        on_open={noop_open}
                        onRender={getOnRender("a")}
                    />
                    <SessionCard
                        s={s2}
                        selected={selected_b}
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

    it("t406 AC-001/003：根背景 surface-window，网格卡片/列表行为 surface-card", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => {
            expect(document.querySelectorAll('[data-testid="library-card"]').length).toBe(3);
        });
        const root = document.querySelector('[data-testid="library-view"]');
        expect(root?.className).toContain("bg-[var(--color-surface-window)]");
        expect(root?.className).not.toContain("bg-[var(--color-surface)]");
        // 网格视图：内容卡片 surface-card，非 raised 整面。
        const card = document.querySelector('[data-testid="library-card"]');
        expect(card?.className).toContain("bg-[var(--color-surface-card)]");
        expect(card?.className).not.toMatch(/(?<!hover:)bg-\[var\(--color-surface-raised\)\]/);
        // 列表视图：行同样 surface-card；hover 仍可用 raised（AC-004）。
        fireEvent.click(screen.getByRole("button", { name: "列表视图" }));
        expect(document.querySelector('[data-testid="library-list"]')).toBeTruthy();
        const row = document.querySelector('[data-testid="library-row"]');
        expect(row?.className).toContain("bg-[var(--color-surface-card)]");
        expect(row?.className).not.toMatch(/(?<!hover:)bg-\[var\(--color-surface-raised\)\]/);
        expect(row?.className).toContain("hover:bg-[var(--color-surface-raised)]");
    });
});

describe("SessionLibrary (t439 并排打开替换语义)", () => {
    it("AC-001/AC-002：并排打开先清空工作台，再按勾选顺序 open 并切页签", async () => {
        const ub = usageboard();
        const switch_fn = vi.fn();
        const clear_fn = vi.fn();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary({ on_switch_workspace: switch_fn, on_clear_workspace: clear_fn });
        await waitFor(() => screen.getByText("会话 a"));

        // 逆列表序勾选 c、a：open 必须按勾选顺序，而非列表顺序。
        fireEvent.click(screen.getByRole("button", { name: "会话 c" }));
        fireEvent.click(screen.getByRole("button", { name: "会话 a" }));
        expect(screen.getByText("2/8")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /并排打开/ }));

        expect(clear_fn).toHaveBeenCalledTimes(1);
        expect(ub.sessionHistory.open).toHaveBeenCalledTimes(2);
        expect(ub.sessionHistory.open).toHaveBeenNthCalledWith(1, "grok", "linux", "c");
        expect(ub.sessionHistory.open).toHaveBeenNthCalledWith(2, "claude_code", "linux", "a");
        // clear 必须同步先于任何 open（与 WorkspaceView.confirm_recent 同序）。
        const clear_order = clear_fn.mock.invocationCallOrder[0];
        const open_orders = ub.sessionHistory.open.mock.invocationCallOrder;
        expect(clear_order).toBeLessThan(open_orders[0] ?? 0);
        expect(switch_fn).toHaveBeenCalledTimes(1);
    });

    it("AC-003：单独打开只装入该会话，不调用清空工作台", async () => {
        const ub = usageboard();
        const switch_fn = vi.fn();
        const clear_fn = vi.fn();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary({ on_switch_workspace: switch_fn, on_clear_workspace: clear_fn });
        await waitFor(() => screen.getByText("会话 a"));

        const open_btns = screen.getAllByRole("button", { name: "单独打开" });
        const open_btn = open_btns[0];
        if (!open_btn) throw new Error("单独打开按钮缺失");
        fireEvent.click(open_btn);

        expect(clear_fn).not.toHaveBeenCalled();
        expect(ub.sessionHistory.open).toHaveBeenCalledTimes(1);
        expect(ub.sessionHistory.open).toHaveBeenNthCalledWith(1, "claude_code", "linux", "a");
        expect(switch_fn).toHaveBeenCalledTimes(1);
    });

    it("t458 AC-001：只填标题输入时列表请求带 title，不带 search", async () => {
        const ub = usageboard();
        const hit = sess("t-hit", "claude_code");
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) =>
            typeof filters["title"] === "string" && filters["title"].length > 0
                ? Promise.resolve([hit])
                : Promise.resolve(SESSIONS),
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.change(screen.getByLabelText("标题"), { target: { value: "t-hit" } });
        await waitFor(() => {
            expect(screen.getByText("会话 t-hit")).toBeTruthy();
            expect(screen.queryByText("会话 a")).toBeNull();
        });
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ title: "t-hit", limit: 50, offset: 0 }),
        );
        const last_call = ub.tokenStats.getSessions.mock.calls.at(-1)?.[0] as Record<
            string,
            unknown
        >;
        expect(last_call).not.toHaveProperty("search");
        expect(last_call).not.toHaveProperty("directory");
    });

    it("t458 AC-002：只填工作目录输入时列表请求带 directory，不串 title/id", async () => {
        const ub = usageboard();
        const dir_hit = sess("d-hit", "opencode");
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) =>
            typeof filters["directory"] === "string" && filters["directory"].length > 0
                ? Promise.resolve([dir_hit])
                : Promise.resolve(SESSIONS),
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.change(screen.getByLabelText("工作目录"), { target: { value: "/proj/d-hit" } });
        await waitFor(() => {
            expect(screen.getByText("会话 d-hit")).toBeTruthy();
            expect(screen.queryByText("会话 a")).toBeNull();
        });
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ directory: "/proj/d-hit" }),
        );
        const last_call = ub.tokenStats.getSessions.mock.calls.at(-1)?.[0] as Record<
            string,
            unknown
        >;
        expect(last_call).not.toHaveProperty("title");
    });

    it("t458 AC-003：标题+目录+日期+Agent+排序同时设置，加载更多分页不丢条件", async () => {
        const ub = usageboard();
        const first_page = Array.from({ length: 50 }, (_, i) =>
            sess(`p${String(i)}`, "claude_code"),
        );
        const second_page = [sess("p50", "claude_code")];
        ub.tokenStats.getSessionStats.mockResolvedValue({
            sessions: 51,
            agents: 1,
            tokens: 1125,
            source_counts: { claude_code: 51 },
        });
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) => {
            if (filters["offset"] === 50) return Promise.resolve(second_page);
            return Promise.resolve(first_page);
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 p0"));

        fireEvent.change(screen.getByLabelText("标题"), { target: { value: "重构" } });
        fireEvent.change(screen.getByLabelText("工作目录"), { target: { value: "/home/alpha" } });
        fireEvent.click(screen.getByRole("button", { name: "📅 自定义" }));
        fireEvent.change(screen.getByLabelText("开始"), {
            target: { value: "2026-07-01T00:00" },
        });
        fireEvent.change(screen.getByLabelText("结束"), {
            target: { value: "2026-07-31T23:59" },
        });
        fireEvent.click(screen.getByRole("button", { name: "应用" }));
        fireEvent.click(screen.getByRole("button", { name: /^Claude/ }));
        fireEvent.click(screen.getByRole("button", { name: "Token 最多" }));
        await waitFor(() => {
            expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    title: "重构",
                    directory: "/home/alpha",
                    sources: ["claude_code"],
                    order_by: "tokens",
                }),
            );
        });

        scroll_to_bottom(grid());
        await waitFor(() => {
            expect(screen.getByText("会话 p50")).toBeTruthy();
        });
        // 加载更多仍携带全部条件与 offset。
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({
                title: "重构",
                directory: "/home/alpha",
                sources: ["claude_code"],
                start_at: expect.any(Number) as number,
                end_at: expect.any(Number) as number,
                order_by: "tokens",
                offset: 50,
            }),
        );
    });

    it("t458 AC-004：清空筛选后 title/directory 输入为空且后续请求不带两参数", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockImplementation((filters: Record<string, unknown> = {}) =>
            filters["title"] === "ghost" ? Promise.resolve([]) : Promise.resolve(SESSIONS),
        );
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.change(screen.getByLabelText("标题"), { target: { value: "ghost" } });
        fireEvent.change(screen.getByLabelText("工作目录"), { target: { value: "/nope" } });
        await waitFor(() => {
            expect(screen.getByText(/清除筛选/)).toBeTruthy();
        });
        fireEvent.click(screen.getByText(/清除筛选/));
        await waitFor(() => {
            expect(screen.getByText("会话 a")).toBeTruthy();
        });
        expect(screen.getByLabelText<HTMLInputElement>("标题").value).toBe("");
        expect(screen.getByLabelText<HTMLInputElement>("工作目录").value).toBe("");
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.not.objectContaining({
                title: expect.stringMatching(/.+/) as string,
                directory: expect.stringMatching(/.+/) as string,
            }),
        );
    });

    it("t458 AC-005：勾选包含消息内容时 searchContent filters 带 title/directory", async () => {
        const ub = usageboard();
        const hidden = sess("hidden", "opencode");
        ub.tokenStats.getSessions.mockResolvedValue([sess("visible", "claude_code")]);
        ub.sessionHistory.searchContent.mockResolvedValue({
            hits: [key_of(hidden)],
            sessions: [hidden],
        });
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 visible"));

        fireEvent.change(screen.getByLabelText("标题"), { target: { value: "部署" } });
        fireEvent.change(screen.getByLabelText("工作目录"), { target: { value: "/srv" } });
        fireEvent.click(screen.getByLabelText("包含消息内容"));
        fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: "秘密词" } });
        await waitFor(() => {
            expect(ub.sessionHistory.searchContent).toHaveBeenCalled();
        });
        const request = ub.sessionHistory.searchContent.mock.calls[0]?.[0] as unknown as Record<
            string,
            unknown
        >;
        expect(request["filters"]).toMatchObject({
            title: "部署",
            directory: "/srv",
            search: "秘密词",
        });
    });

    it("t458 AC-001 补充：标题输入为空串时请求不带 title", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.change(screen.getByLabelText("标题"), { target: { value: "临时" } });
        await waitFor(() => {
            expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
                expect.objectContaining({ title: "临时" }),
            );
        });
        fireEvent.change(screen.getByLabelText("标题"), { target: { value: "" } });
        await waitFor(() => {
            expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
                expect.objectContaining({ limit: 50, offset: 0 }),
            );
        });
        const last_call = ub.tokenStats.getSessions.mock.calls.at(-1)?.[0] as Record<
            string,
            unknown
        >;
        expect(last_call).not.toHaveProperty("title");
    });
});

describe("SessionLibrary 侧边栏（数轴筛选/同屏最近/重置）", () => {
    function stats_with_maxima() {
        return { sessions: 3, agents: 3, tokens: 1125, max_tokens: 900000, max_calls: 80 };
    }

    it("Token 数轴下限拖动 300ms 防抖后转为后端 min_tokens", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessionStats.mockResolvedValue(stats_with_maxima());
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByTestId("range-filter-tokens-min"), {
            target: { value: "450000" },
        });
        expect(screen.getByTestId("range-filter-tokens-value").textContent).toContain("450k");
        const calls_before = ub.tokenStats.getSessions.mock.calls.length;
        act(() => {
            vi.advanceTimersByTime(400);
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({ min_tokens: 450000 }),
        );
        // 未继续拖动不再触发额外请求（prev 身份守卫）。
        act(() => {
            vi.advanceTimersByTime(600);
        });
        expect(ub.tokenStats.getSessions.mock.calls.length).toBe(calls_before + 1);
        vi.useRealTimers();
    });

    it("数轴轨道：灰底 + 主色填充段随区间定位", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessionStats.mockResolvedValue(stats_with_maxima());
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => screen.getByText(/3 个会话/));

        const card = screen.getByTestId("range-filter-tokens");
        const find_fill = () =>
            [...card.querySelectorAll("div")].find((d) =>
                d.className.includes("bg-[var(--color-primary)]"),
            );
        const find_track = () =>
            [...card.querySelectorAll("div")].find((d) =>
                d.className.includes("bg-[var(--color-surface-raised)]"),
            );
        expect(find_track()).toBeTruthy();
        // 默认全区间：填充段铺满。
        expect(find_fill()?.style.left).toBe("0%");
        expect(find_fill()?.style.right).toBe("0%");
        // min 拖到一半（450000/900000）：填充段左端 50%。
        fireEvent.change(screen.getByTestId("range-filter-tokens-min"), {
            target: { value: "450000" },
        });
        expect(find_fill()?.style.left).toBe("50%");
    });

    it("上限拖到顶端回传 undefined：常显区间值且查询不带 max_calls", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessionStats.mockResolvedValue(stats_with_maxima());
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByTestId("range-filter-calls-max"), {
            target: { value: "80" },
        });
        // 展示对齐 demo：常显区间值，上限端带「+」（拖至端点仍回传 undefined）。
        expect(screen.getByTestId("range-filter-calls-value").textContent).toBe("0 – 80+");
        act(() => {
            vi.advanceTimersByTime(400);
        });
        await act(async () => {
            await Promise.resolve();
        });
        const last = ub.tokenStats.getSessions.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect("max_calls" in last).toBe(false);
        vi.useRealTimers();
    });

    it("统计缺 max_tokens/max_calls（旧 mock）时数轴滑杆禁用", async () => {
        const ub = usageboard();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await waitFor(() => screen.getByText(/3 个会话/));
        const min_slider = screen.getByTestId("range-filter-tokens-min");
        const max_slider = screen.getByTestId("range-filter-calls-max");
        expect((min_slider as HTMLInputElement).disabled).toBe(true);
        expect((max_slider as HTMLInputElement).disabled).toBe(true);
    });

    it("内容搜索命中集按数轴区间客户端补过滤", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessionStats.mockResolvedValue(stats_with_maxima());
        const low = sess("low", "claude_code", { input_tokens: 100 }); // 375 tokens
        const high = sess("high", "opencode", { input_tokens: 400000 }); // 400375 tokens
        ub.tokenStats.getSessions.mockResolvedValue([low, high]);
        ub.sessionHistory.searchContent.mockResolvedValue({
            hits: [key_of(low), key_of(high)],
            sessions: [low, high],
        });
        await renderLibrary();
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByPlaceholderText(/搜索标题/), { target: { value: "fix" } });
        fireEvent.click(screen.getByLabelText("包含消息内容"));
        act(() => {
            vi.advanceTimersByTime(400);
        });
        await act(async () => {
            await Promise.resolve();
        });
        await waitFor(() => {
            expect(screen.getByText("会话 low")).toBeTruthy();
            expect(screen.getByText("会话 high")).toBeTruthy();
        });

        fireEvent.change(screen.getByTestId("range-filter-tokens-min"), {
            target: { value: "100000" },
        });
        act(() => {
            vi.advanceTimersByTime(400);
        });
        await act(async () => {
            await Promise.resolve();
        });
        await waitFor(() => {
            expect(screen.queryByText("会话 low")).toBeNull();
            expect(screen.getByText("会话 high")).toBeTruthy();
        });
        vi.useRealTimers();
    });

    it("同屏最近 4：按 ended_at desc 拉取后先清空再逐个打开并切工作台", async () => {
        const ub = usageboard();
        const switch_fn = vi.fn();
        const clear_fn = vi.fn();
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary({ on_switch_workspace: switch_fn, on_clear_workspace: clear_fn });
        await waitFor(() => screen.getByText("会话 a"));

        fireEvent.click(screen.getByTestId("open-recent-4"));
        await waitFor(() => {
            expect(switch_fn).toHaveBeenCalledTimes(1);
        });
        expect(clear_fn).toHaveBeenCalledTimes(1);
        expect(ub.sessionHistory.open).toHaveBeenCalledTimes(3);
        const clear_order = clear_fn.mock.invocationCallOrder[0];
        const first_open_order = ub.sessionHistory.open.mock.invocationCallOrder[0];
        if (clear_order === undefined || first_open_order === undefined) {
            throw new Error("调用序缺失");
        }
        expect(clear_order).toBeLessThan(first_open_order);
        expect(ub.tokenStats.getSessions).toHaveBeenLastCalledWith(
            expect.objectContaining({
                order_by: "ended_at",
                direction: "desc",
                limit: 4,
                offset: 0,
            }),
        );
    });

    it("同屏最近结果为空：toast 提示且不清空工作台", async () => {
        const ub = usageboard();
        const clear_fn = vi.fn();
        ub.tokenStats.getSessions.mockResolvedValue([]);
        await renderLibrary({ on_clear_workspace: clear_fn });

        fireEvent.click(screen.getByTestId("open-recent-2"));
        await waitFor(() => {
            expect(screen.getByText("没有可同屏打开的会话")).toBeTruthy();
        });
        expect(clear_fn).not.toHaveBeenCalled();
    });

    it("重置：清空搜索/预设/agent/数轴并恢复排序为最近活跃", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const ub = usageboard();
        ub.tokenStats.getSessionStats.mockResolvedValue(stats_with_maxima());
        ub.tokenStats.getSessions.mockResolvedValue(SESSIONS);
        await renderLibrary();
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.change(screen.getByPlaceholderText(/搜索标题/), { target: { value: "abc" } });
        fireEvent.click(screen.getByTestId("time-preset-7d"));
        fireEvent.click(screen.getByRole("button", { name: "轮次最多" }));
        fireEvent.change(screen.getByTestId("range-filter-tokens-min"), {
            target: { value: "450000" },
        });
        act(() => {
            vi.advanceTimersByTime(400);
        });
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getByRole("button", { name: "重置" }));
        act(() => {
            vi.advanceTimersByTime(400);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByPlaceholderText(/搜索标题/)).toHaveValue("");
        expect(screen.getByTestId("range-filter-tokens-value").textContent).toBe("0 – 900k+");
        const last = ub.tokenStats.getSessions.mock.calls.at(-1)?.[0] as Record<string, unknown>;
        expect(last["min_tokens"]).toBeUndefined();
        expect(last["start_at"]).toBeUndefined();
        expect(last["order_by"]).toBe("ended_at");
        vi.useRealTimers();
    });
});
