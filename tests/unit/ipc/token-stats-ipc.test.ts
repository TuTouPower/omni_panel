import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TokenStatsStore } from "../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsManager } from "../../../src/main/core/token-stats/manager";
import type { TokenStatsQueryDispatcher } from "../../../src/main/core/token-stats/query-dispatcher";
import type { TokenStatsDashboardDto } from "../../../src/shared/types/token-stats";
import { set_renderer_index_path } from "../../../src/main/ipc/helpers";

// t178: 移除未初始化 fallback 后，测试须显式初始化 renderer index path（模拟生产接线）。
set_renderer_index_path("D:/app/out/renderer/index.html");

type Ipc_handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type Ipc_handle = (channel: string, listener: Ipc_handler) => void;

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn<Ipc_handle>(),
}));

vi.mock("electron", () => ({
    ipcMain: ipc_main_mock,
}));

function createMockDeps() {
    const store = {
        query_buckets: vi.fn().mockReturnValue([]),
        query_sessions: vi.fn().mockReturnValue([]),
        query_records: vi.fn().mockReturnValue([]),
        query_heatmap: vi.fn().mockReturnValue([]),
        query_hour_buckets: vi.fn().mockReturnValue([]),
        query_range_rollup: vi.fn().mockReturnValue([]),
        query_dashboard: vi.fn(),
        last_updated: vi.fn().mockReturnValue(null),
    } as unknown as TokenStatsStore;
    const manager = {
        is_running: vi.fn().mockReturnValue(false),
    } as unknown as TokenStatsManager;
    const dispatcher = {
        request_dashboard: vi.fn(),
        is_running: vi.fn().mockReturnValue(false),
        stop: vi.fn(),
    } as unknown as TokenStatsQueryDispatcher;
    return { store, manager, dispatcher };
}

function bad_event(): Electron.IpcMainInvokeEvent {
    return { senderFrame: { url: "about:blank" } } as unknown as Electron.IpcMainInvokeEvent;
}

function good_event(): Electron.IpcMainInvokeEvent {
    return {
        senderFrame: { url: "file:///D:/app/out/renderer/index.html" },
    } as unknown as Electron.IpcMainInvokeEvent;
}

function pick_handler(channel: string): Ipc_handler {
    const entry = ipc_main_mock.handle.mock.calls.find(([ch]) => ch === channel);
    if (!entry) throw new Error(`missing ${channel} handler`);
    return entry[1];
}

describe("token-stats-ipc sender validation", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        // resetModules 清空模块缓存后，重新初始化 renderer index path（模拟生产接线）。
        const { set_renderer_index_path } = await import("../../../src/main/ipc/helpers");
        set_renderer_index_path("D:/app/out/renderer/index.html");
    });

    it("TOKEN_STATS_BUCKETS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:buckets")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_SESSIONS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:sessions")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_RECORDS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:records")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_HEATMAP rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:heatmap")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_HOUR_BUCKETS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:hourBuckets")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_STATUS rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        expect(() => pick_handler("tokenStats:status")(bad_event())).toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_DASHBOARD rejects unknown sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        await expect(pick_handler("tokenStats:dashboard")(bad_event(), {})).rejects.toThrow(
            "IPC not allowed from unknown origin",
        );
    });

    it("TOKEN_STATS_DASHBOARD rejects an invalid query before touching the dispatcher", async () => {
        const deps = createMockDeps();
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, deps);
        const result = await pick_handler("tokenStats:dashboard")(good_event(), {
            agent: "invalid",
        });
        expect(result).toEqual({
            ok: false,
            error: { code: "INVALID_ARGUMENT", message: "Invalid token stats dashboard query" },
        });
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(deps.dispatcher.request_dashboard).not.toHaveBeenCalled();
    });

    it("TOKEN_STATS_DASHBOARD delegates a valid query to the isolated dispatcher", async () => {
        const deps = createMockDeps();
        const dashboard: TokenStatsDashboardDto = {
            query: {
                agent: "all",
                platform: "all",
                start: 1,
                end: 2,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            current: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            previous: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: [], bucket_starts: [] },
                metric_buckets: [],
                session_buckets: [],
                rollup: [],
            },
            heatmap: [],
            sessions: { items: [], total: 0, has_more: false },
            status: { running: false, last_updated: null },
            freshness: { queried_at: 3, stale: false },
            data_version: 0,
        };
        // eslint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(deps.dispatcher.request_dashboard).mockResolvedValue(dashboard);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(deps.store.last_updated).mockReturnValue(42);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(deps.manager.is_running).mockReturnValue(true);
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, deps);

        const request = {
            agent: "all",
            platform: "all",
            start: 1,
            end: 2,
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        };
        const result = await pick_handler("tokenStats:dashboard")(good_event(), request);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(vi.mocked(deps.dispatcher.request_dashboard)).toHaveBeenCalledWith(request, {
            running: true,
            last_updated: 42,
        });
        expect(result).toEqual({ ok: true, data: dashboard });
    });

    it("TOKEN_STATS_DASHBOARD returns QUERY_FAILED when the dispatcher rejects", async () => {
        const deps = createMockDeps();
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, deps);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(deps.dispatcher.request_dashboard).mockRejectedValue(new Error("boom"));
        const result = await pick_handler("tokenStats:dashboard")(good_event(), {
            agent: "all",
            platform: "all",
            start: 1,
            end: 2,
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        expect(result).toEqual({
            ok: false,
            error: { code: "QUERY_FAILED", message: "Token stats dashboard query failed" },
        });
    });

    it("TOKEN_STATS_DASHBOARD returns INVALID_RESPONSE for a malformed DTO", async () => {
        const deps = createMockDeps();
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, deps);
        // Missing required summary fields and a bounded chart contract violation.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(deps.dispatcher.request_dashboard).mockResolvedValue({
            query: {
                agent: "all",
                platform: "all",
                start: 1,
                end: 2,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            current: { tokens: -1, sessions: 0, calls: 0 },
            previous: { tokens: 0, sessions: 0, calls: 0 },
            chart_data: {
                axis: { labels: [], bucket_starts: [] },
                metric_buckets: [],
                session_buckets: [],
                rollup: [],
            },
            heatmap: [],
            sessions: { items: [], total: 0, has_more: false },
            status: { running: false, last_updated: null },
            freshness: { queried_at: 3, stale: false },
        } as unknown as TokenStatsDashboardDto);
        const result = await pick_handler("tokenStats:dashboard")(good_event(), {
            agent: "all",
            platform: "all",
            start: 1,
            end: 2,
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        expect(result).toEqual({
            ok: false,
            error: { code: "INVALID_RESPONSE", message: "Invalid token stats dashboard response" },
        });
    });

    it("AC1: a pending dashboard query does not block the lightweight status IPC", async () => {
        const deps = createMockDeps();
        // Dashboard query hangs indefinitely (never resolves) — the slow-query
        // stand-in. The status handler must still answer immediately.
        let release!: (dto: TokenStatsDashboardDto) => void;
        const pending = new Promise<TokenStatsDashboardDto>((resolve) => {
            release = resolve;
        });
        // eslint-disable-next-line @typescript-eslint/unbound-method
        vi.mocked(deps.dispatcher.request_dashboard).mockReturnValue(pending);
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, deps);

        const dashboard_promise = pick_handler("tokenStats:dashboard")(good_event(), {
            agent: "all",
            platform: "all",
            start: 1,
            end: 2,
            metric: "tokens",
            xaxis: "time",
            gran: "hour",
        });
        // The dashboard query is in flight; a status request resolves without
        // waiting for it.
        const status_result = pick_handler("tokenStats:status")(good_event());
        expect(status_result).toEqual({
            ok: true,
            data: { running: false, last_updated: null },
        });

        const complete_dto: TokenStatsDashboardDto = {
            query: {
                agent: "all",
                platform: "all",
                start: 1,
                end: 2,
                metric: "tokens",
                xaxis: "time",
                gran: "hour",
            },
            current: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            previous: {
                tokens: 0,
                sessions: 0,
                calls: 0,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                agent_totals: [],
                model_token_totals: [],
                model_call_totals: [],
                project_session_totals: [],
            },
            chart_data: {
                axis: { labels: [], bucket_starts: [] },
                metric_buckets: [],
                session_buckets: [],
                rollup: [],
            },
            heatmap: [],
            sessions: { items: [], total: 0, has_more: false },
            status: { running: false, last_updated: null },
            freshness: { queried_at: 3, stale: false },
            data_version: 0,
        };
        release(complete_dto);
        await expect(dashboard_promise).resolves.toEqual({ ok: true, data: complete_dto });
    });

    it("TOKEN_STATS_BUCKETS allows valid sender", async () => {
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, createMockDeps());
        const result = pick_handler("tokenStats:buckets")(good_event());
        expect(result).toEqual({ ok: true, data: [] });
    });

    it("TOKEN_STATS_HEATMAP allows valid sender and delegates to query_heatmap", async () => {
        const deps = createMockDeps();
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, deps);
        const result = pick_handler("tokenStats:heatmap")(good_event(), {
            start: 1,
            end: 2,
        });
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(vi.mocked(deps.store).query_heatmap).toHaveBeenCalledWith({ start: 1, end: 2 });
        expect(result).toEqual({ ok: true, data: [] });
    });

    it("TOKEN_STATS_HOUR_BUCKETS allows valid sender and delegates to query_hour_buckets", async () => {
        const deps = createMockDeps();
        const { registerTokenStatsIpc } = await import("../../../src/main/ipc/token-stats-ipc");
        registerTokenStatsIpc((await import("electron")).ipcMain, deps);
        const result = pick_handler("tokenStats:hourBuckets")(good_event(), {
            start: 1,
            end: 2,
        });
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(vi.mocked(deps.store).query_hour_buckets).toHaveBeenCalledWith({ start: 1, end: 2 });
        expect(result).toEqual({ ok: true, data: [] });
    });
});
