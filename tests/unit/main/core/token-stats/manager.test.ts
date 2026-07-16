import { describe, it, expect, vi } from "vitest";
import type { TokenStatsStore } from "../../../../../src/main/core/token-stats/token-stats-store";
import type { TokenStatsConfig } from "../../../../../src/shared/types/token-stats";

function create_mock_store(): TokenStatsStore & { _buckets: unknown[]; _sessions: unknown[] } {
    const _buckets: unknown[] = [];
    const _sessions: unknown[] = [];
    return {
        _buckets,
        _sessions,
        upsert_buckets: vi.fn((b: unknown[]) => _buckets.push(...b)),
        upsert_sessions: vi.fn((s: unknown[]) => _sessions.push(...s)),
        query_buckets: vi.fn(() => []),
        query_sessions: vi.fn(() => []),
        close: vi.fn(),
    };
}

// Test the exported configure + collect path (same code path the manager uses)
import {
    configure,
    reset_config,
    collect,
} from "../../../../../src/main/core/token-stats/collector";

const base_config: TokenStatsConfig = {
    win_home: "C:\\Users\\Test",
    wsl_enabled: false,
    wsl_distro: "Ubuntu-22.04",
    wsl_user: "testuser",
    poll_interval_ms: 600000,
};

// Mock readers to avoid file system access
vi.mock("../../../../../src/main/core/token-stats/claude-reader", () => ({
    read_costs_jsonl: vi.fn(() => ({ sessions: [], new_offset: 0, new_size: 0 })),
}));
vi.mock("../../../../../src/main/core/token-stats/opencode-reader", () => ({
    read_opencode_sessions: vi.fn(() => []),
}));

// Mock process.send
const mock_send = vi.fn();
process.send = mock_send as typeof process.send;

describe("token-stats manager integration", () => {
    it("configure sets config and collect sends update via process.send", () => {
        mock_send.mockClear();
        reset_config();
        configure(base_config);

        expect(mock_send).toHaveBeenCalledTimes(1);
        const update = mock_send.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(update.type).toBe("token_stats_update");
        expect(Array.isArray(update.buckets)).toBe(true);
        expect(Array.isArray(update.sessions)).toBe(true);
    });

    it("collect does nothing without config", () => {
        mock_send.mockClear();
        reset_config();
        collect();
        expect(mock_send).not.toHaveBeenCalled();
    });

    it("manager create_token_stats_manager returns expected interface", async () => {
        // Test manager can be imported and creates expected shape
        // Use dynamic import to avoid fork side-effects
        const { create_token_stats_manager } =
            await import("../../../../../src/main/core/token-stats/manager");
        const store = create_mock_store();
        const manager = create_token_stats_manager({ store });
        expect(typeof manager.start).toBe("function");
        expect(typeof manager.stop).toBe("function");
        expect(typeof manager.update_config).toBe("function");
    });
});
