import { describe, it, expect, vi, beforeEach } from "vitest";
import { set_renderer_index_path } from "../../../src/main/ipc/helpers";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";

const ipc_main_mock = vi.hoisted(() => ({
    handle: vi.fn(),
    removeHandler: vi.fn(),
}));

vi.mock("electron", () => ({
    ipcMain: ipc_main_mock,
}));

// t178: 移除未初始化 fallback 后，测试须显式初始化 renderer index path（模拟生产接线）。
set_renderer_index_path("D:/app/out/renderer/index.html");

// A valid sender frame (packaged app file:// origin) so assert_valid_sender passes.
const valid_sender = { senderFrame: { url: "file:///D:/app/out/renderer/index.html" } };

interface TrendRecord {
    used: number | null;
    limit: number | null;
    observed_at: number;
}

describe("trend-ipc", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        const { set_renderer_index_path } = await import("../../../src/main/ipc/helpers");
        set_renderer_index_path("D:/app/out/renderer/index.html");
    });

    it("registers TREND_GET and TREND_GET_BULK handlers", async () => {
        const { registerTrendIpc } = await import("../../../src/main/ipc/trend-ipc");
        const query_trend_series = vi.fn().mockReturnValue([]);
        registerTrendIpc(ipc_main_mock as never, {
            store: { query_trend_series } as unknown as ObservationStore,
        });

        const channels = ipc_main_mock.handle.mock.calls.map((call: unknown[]) => call[0]);
        expect(channels).toContain("trend:get");
        expect(channels).toContain("trend:getBulk");
    });

    it("TREND_GET maps records to trend points with default 7 days (t196 AC5 regression)", async () => {
        const { registerTrendIpc } = await import("../../../src/main/ipc/trend-ipc");
        const query_trend_series = vi
            .fn()
            .mockReturnValue([
                { used: 30, limit: 100, observed_at: Date.UTC(2026, 6, 14, 12, 0, 0) },
            ]);
        registerTrendIpc(ipc_main_mock as never, {
            store: { query_trend_series } as unknown as ObservationStore,
        });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "trend:get",
        )?.[1] as (
            event: unknown,
            provider: string,
            accountId: string,
            metricId: string,
            sourceInstanceId: string,
            days?: number,
        ) => unknown;

        const result = handler(valid_sender, "claude", "acc-a", "5h", "inst-a") as {
            ok: true;
            data: unknown;
        };
        expect(result.ok).toBe(true);
        expect(query_trend_series).toHaveBeenCalledWith("claude", "acc-a", "5h", "inst-a", 7);
        expect(result.data).toEqual([{ date: "2026-07-14", percent: 30 }]);
    });

    it("TREND_GET_BULK returns one series per period, querying each (t196 AC5)", async () => {
        const { registerTrendIpc } = await import("../../../src/main/ipc/trend-ipc");
        const query_trend_series = vi.fn(
            (
                provider: string,
                account_id: string,
                metric_id: string,
                source_instance_id: string,
                days: number,
            ): (TrendRecord | null)[] => {
                void provider;
                void account_id;
                void source_instance_id;
                void days;
                if (metric_id === "5h") {
                    return [{ used: 10, limit: 100, observed_at: Date.UTC(2026, 6, 15, 8) }];
                }
                if (metric_id === "5d") {
                    return [{ used: 40, limit: 100, observed_at: Date.UTC(2026, 6, 16, 8) }];
                }
                return [];
            },
        );
        registerTrendIpc(ipc_main_mock as never, {
            store: { query_trend_series } as unknown as ObservationStore,
        });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "trend:getBulk",
        )?.[1] as (event: unknown, payload: unknown) => unknown;

        const result = handler(valid_sender, {
            provider: "claude",
            account_id: "acc-a",
            source_instance_id: "inst-a",
            periods: [{ metric_id: "5h" }, { metric_id: "5d", days: 14 }],
        }) as { ok: true; data: { series: unknown[] } };

        expect(result.ok).toBe(true);
        expect(query_trend_series).toHaveBeenCalledTimes(2);
        expect(query_trend_series).toHaveBeenNthCalledWith(1, "claude", "acc-a", "5h", "inst-a", 7);
        expect(query_trend_series).toHaveBeenNthCalledWith(
            2,
            "claude",
            "acc-a",
            "5d",
            "inst-a",
            14,
        );
        expect(result.data.series).toEqual([
            { metric_id: "5h", series: [{ date: "2026-07-15", percent: 10 }] },
            { metric_id: "5d", series: [{ date: "2026-07-16", percent: 40 }] },
        ]);
    });

    it("TREND_GET_BULK floors fractional days and defaults to 7 (t196 AC5 parity)", async () => {
        const { registerTrendIpc } = await import("../../../src/main/ipc/trend-ipc");
        const query_trend_series = vi.fn().mockReturnValue([]);
        registerTrendIpc(ipc_main_mock as never, {
            store: { query_trend_series } as unknown as ObservationStore,
        });

        const handler = ipc_main_mock.handle.mock.calls.find(
            (call: unknown[]) => call[0] === "trend:getBulk",
        )?.[1] as (event: unknown, payload: unknown) => unknown;

        handler(valid_sender, {
            provider: "claude",
            account_id: "acc-a",
            source_instance_id: "inst-a",
            periods: [{ metric_id: "5h", days: 2.9 }, { metric_id: "5d" }],
        });

        expect(query_trend_series).toHaveBeenNthCalledWith(1, "claude", "acc-a", "5h", "inst-a", 2);
        expect(query_trend_series).toHaveBeenNthCalledWith(2, "claude", "acc-a", "5d", "inst-a", 7);
    });
});
