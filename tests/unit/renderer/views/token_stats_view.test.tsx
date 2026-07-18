import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSessionUsage } from "../../../../src/shared/types/token-stats";
import { TokenStatsView } from "../../../../src/renderer/views/TokenStatsView";

vi.mock("../../../../src/renderer/components/token-stats/MetricDonut", () => ({
    MetricDonut: () => <div />,
}));
vi.mock("../../../../src/renderer/components/token-stats/BarChart", () => ({
    BarChart: () => <div />,
}));
vi.mock("../../../../src/renderer/components/token-stats/Heatmap", () => ({
    Heatmap: () => <div />,
}));
vi.mock("../../../../src/renderer/components/token-stats/SessionTable", () => ({
    SessionTable: ({ records }: { records: AgentSessionUsage[] }) => (
        <div data-testid="session-records">
            {records.map((record) => record.message_id).join(",")}
        </div>
    ),
}));
vi.mock("../../../../src/renderer/components/token-stats/RangePicker", () => ({
    RangePicker: () => <div />,
}));

function usage_record(message_id: string): AgentSessionUsage {
    return {
        session_id: "session-1",
        title: "Session",
        directory: "D:\\project",
        slug: null,
        version: null,
        parent_session_id: null,
        message_id,
        role: "assistant",
        timestamp: Date.now() - 1000,
        model: "model-1",
        input_tokens: 100,
        output_tokens: 10,
        cache_read_tokens: 5,
        cache_write_tokens: 0,
        agent: "claude-code",
    };
}

function usage_record_at(message_id: string, timestamp: number): AgentSessionUsage {
    return { ...usage_record(message_id), timestamp };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolver) => {
        resolve = resolver;
    });
    return { promise, resolve };
}

describe("TokenStatsView", () => {
    const get_records = vi.fn();

    beforeEach(() => {
        get_records.mockReset();
        get_records.mockResolvedValue([usage_record("all-record")]);
        window.usageboard = {
            tokenStats: {
                open: vi.fn(),
                getBuckets: vi.fn(),
                getSessions: vi.fn(),
                getRecords: get_records,
                getStatus: vi.fn().mockResolvedValue({ running: true, last_updated: null }),
                onUpdated: vi.fn(() => vi.fn()),
            },
            log: vi.fn(),
        } as unknown as typeof window.usageboard;
    });

    it("loads all platforms by default and switches between Win, WSL, and all", async () => {
        get_records
            .mockResolvedValueOnce([usage_record("all-record")])
            .mockResolvedValueOnce([usage_record("win-record")])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([usage_record("all-again")]);

        render(<TokenStatsView />);
        const user = userEvent.setup();

        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(1, {});
        });
        expect(await screen.findByTestId("session-records")).toHaveTextContent("all-record");

        // Kimi Code option is present in the agent filter.
        expect(screen.getByRole("button", { name: "Kimi Code" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Win" }));
        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(2, { env: "win" });
        });
        expect(await screen.findByTestId("session-records")).toHaveTextContent("win-record");

        await user.click(screen.getByRole("button", { name: "WSL" }));
        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(3, { env: "wsl" });
        });
        expect(await screen.findByText("该筛选条件下暂无记录")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "全平台" }));
        await waitFor(() => {
            expect(get_records).toHaveBeenNthCalledWith(4, {});
        });
        expect(await screen.findByTestId("session-records")).toHaveTextContent("all-again");
    });

    it("ignores an older platform response after a faster switch", async () => {
        const all_request = deferred<AgentSessionUsage[]>();
        get_records.mockImplementation((filters: { env?: "win" | "wsl" }) => {
            if (filters.env === "wsl") {
                return Promise.resolve([usage_record("wsl-record")]);
            }
            return all_request.promise;
        });

        render(<TokenStatsView />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "WSL" }));

        expect(await screen.findByTestId("session-records")).toHaveTextContent("wsl-record");
        all_request.resolve([usage_record("stale-all-record")]);

        await waitFor(() => {
            expect(screen.getByTestId("session-records")).toHaveTextContent("wsl-record");
        });
        expect(screen.getByTestId("session-records")).not.toHaveTextContent("stale-all-record");
    });

    it("shows period-over-period delta when the prior window has records", async () => {
        const now = Date.now();
        const day = 86400000;
        // preset "7d" → current = [now-7d, now], prior = [now-14d, now-7d]
        const current_rec = usage_record_at("current-msg", now - 1 * day);
        const prior_rec = usage_record_at("prior-msg", now - 8 * day);
        get_records.mockResolvedValue([current_rec, prior_rec]);

        render(<TokenStatsView />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "7 天" }));

        // current-window record reaches the table
        expect(await screen.findByTestId("session-records")).toHaveTextContent("current-msg");

        // KPI deltas must show a percentage arrow, not "前段无数据"
        await waitFor(() => {
            expect(screen.queryAllByText("前段无数据")).toHaveLength(0);
        });
        expect(screen.getAllByText(/▲|▼/).length).toBeGreaterThan(0);
    });
});
