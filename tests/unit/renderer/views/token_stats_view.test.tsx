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

describe("TokenStatsView period delta", () => {
    const get_records = vi.fn();

    beforeEach(() => {
        get_records.mockReset();
        get_records.mockResolvedValue([usage_record("r")]);
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
