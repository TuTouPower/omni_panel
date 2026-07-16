/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-empty-function */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock readers ---

const mock_read_costs = vi.fn();
const mock_read_opencode_sessions = vi.fn();

vi.mock("../../../../../src/main/core/token-stats/claude-reader", () => ({
    read_costs_jsonl: (...args: unknown[]) => mock_read_costs(...args),
}));
vi.mock("../../../../../src/main/core/token-stats/opencode-reader", () => ({
    read_opencode_sessions: (...args: unknown[]) => mock_read_opencode_sessions(...args),
}));

// Mock process.send
const mock_send = vi.fn();
process.send = mock_send as typeof process.send;

// Import after mocks
import {
    collect,
    configure,
    reset_config,
    state,
    claude_path,
    opencode_path,
} from "../../../../../src/main/core/token-stats/collector";
import type {
    TokenStatsConfig,
    TokenStatsSession,
} from "../../../../../src/shared/types/token-stats";

// --- Helpers ---

const base_config: TokenStatsConfig = {
    win_home: "C:\\Users\\Test",
    wsl_enabled: false,
    wsl_distro: "Ubuntu-22.04",
    wsl_user: "testuser",
    poll_interval_ms: 600000,
};

const wsl_config: TokenStatsConfig = {
    ...base_config,
    wsl_enabled: true,
    wsl_user: "testuser",
};

function session(overrides: Partial<TokenStatsSession> = {}): TokenStatsSession {
    return {
        id: "s1",
        source: "claude_code",
        env: "win",
        model: "claude-sonnet-4-20250514",
        title: null,
        directory: null,
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 10,
        cache_write_tokens: 5,
        calls: 2,
        started_at: new Date("2026-07-10T08:00:00Z").getTime(),
        ended_at: new Date("2026-07-10T09:00:00Z").getTime(),
        ...overrides,
    };
}

// --- Tests ---

describe("collector", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        state.clear();
        reset_config();

        mock_read_costs.mockReturnValue({
            sessions: [],
            new_offset: 0,
            new_size: 0,
        });
        mock_read_opencode_sessions.mockReturnValue([]);
    });

    describe("path builders", () => {
        it("builds Win Claude path", () => {
            const p = claude_path(base_config, "win");
            expect(p).toBe("C:\\Users\\Test\\.claude\\metrics\\costs.jsonl");
        });

        it("builds WSL Claude path", () => {
            const p = claude_path(wsl_config, "wsl");
            expect(p).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.claude\\metrics\\costs.jsonl",
            );
        });

        it("builds Win OpenCode path", () => {
            const p = opencode_path(base_config, "win");
            expect(p).toBe("C:\\Users\\Test\\.local\\share\\opencode\\opencode.db");
        });

        it("builds WSL OpenCode path", () => {
            const p = opencode_path(wsl_config, "wsl");
            expect(p).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.local\\share\\opencode\\opencode.db",
            );
        });
    });

    describe("collect()", () => {
        it("reads from Win sources and sends update via process.send", () => {
            const claude_session = session({ id: "c1", source: "claude_code" });
            const opencode_session = session({ id: "o1", source: "opencode" });

            mock_read_costs.mockReturnValue({
                sessions: [claude_session],
                new_offset: 500,
                new_size: 500,
            });
            mock_read_opencode_sessions.mockReturnValue([opencode_session]);

            configure(base_config);

            expect(mock_send).toHaveBeenCalledTimes(1);
            const update = mock_send.mock.calls[0][0];

            expect(update.type).toBe("token_stats_update");
            expect(update.sessions).toHaveLength(2);
            expect(update.sessions.map((s: TokenStatsSession) => s.id).sort()).toEqual([
                "c1",
                "o1",
            ]);
            expect(update.buckets.length).toBeGreaterThan(0);
        });

        it("tracks incremental offsets correctly", () => {
            // First collection
            mock_read_costs.mockReturnValue({
                sessions: [session({ id: "c1" })],
                new_offset: 100,
                new_size: 100,
            });
            mock_read_opencode_sessions.mockReturnValue([
                session({ id: "o1", source: "opencode", ended_at: 1000 }),
            ]);

            configure(base_config);

            expect(mock_read_costs).toHaveBeenLastCalledWith(expect.any(String), "win", 0, 0);
            expect(mock_read_opencode_sessions).toHaveBeenLastCalledWith(
                expect.any(String),
                "win",
                0,
            );

            mock_send.mockClear();

            // Second collection — should pass previous offset/size/max_updated
            mock_read_costs.mockReturnValue({
                sessions: [session({ id: "c2" })],
                new_offset: 200,
                new_size: 200,
            });
            mock_read_opencode_sessions.mockReturnValue([
                session({ id: "o2", source: "opencode", ended_at: 2000 }),
            ]);

            collect();

            expect(mock_read_costs).toHaveBeenLastCalledWith(expect.any(String), "win", 100, 100);
            expect(mock_read_opencode_sessions).toHaveBeenLastCalledWith(
                expect.any(String),
                "win",
                1000,
            );
        });

        it("skips WSL sources when wsl_enabled=false", () => {
            mock_read_costs.mockReturnValue({
                sessions: [session()],
                new_offset: 100,
                new_size: 100,
            });

            configure(base_config);

            // read_costs should only be called once (win, not wsl)
            expect(mock_read_costs).toHaveBeenCalledTimes(1);
            expect(mock_read_costs).toHaveBeenCalledWith(
                expect.stringContaining("Users"),
                "win",
                0,
                0,
            );
        });

        it("reads WSL sources when wsl_enabled=true", () => {
            mock_read_costs.mockReturnValue({
                sessions: [],
                new_offset: 0,
                new_size: 0,
            });
            mock_read_opencode_sessions.mockReturnValue([]);

            configure(wsl_config);

            // read_costs called twice: win + wsl
            expect(mock_read_costs).toHaveBeenCalledTimes(2);

            const wsl_call = mock_read_costs.mock.calls.find((c: unknown[]) =>
                (c[0] as string).includes("wsl.localhost"),
            );
            expect(wsl_call).toBeDefined();
            expect(wsl_call![1]).toBe("wsl");

            // opencode also called for wsl
            const oc_wsl_call = mock_read_opencode_sessions.mock.calls.find((c: unknown[]) =>
                (c[0] as string).includes("wsl.localhost"),
            );
            expect(oc_wsl_call).toBeDefined();
            expect(oc_wsl_call![1]).toBe("wsl");
        });

        it("one source failure doesn't prevent other sources from being collected", () => {
            const win_session = session({ id: "win-ok" });

            // Claude Win fails, Claude WSL succeeds (empty)
            mock_read_costs.mockImplementation((_path: string, env: string) => {
                if (env === "win") {
                    throw new Error("file locked");
                }
                return { sessions: [], new_offset: 0, new_size: 0 };
            });

            // OpenCode returns session only for win
            mock_read_opencode_sessions.mockImplementation((_path: string, env: string) => {
                if (env === "win") return [win_session];
                return [];
            });

            const spy = vi.spyOn(console, "error").mockImplementation(() => {});
            configure(wsl_config);

            // Update should still be sent with the opencode win session
            expect(mock_send).toHaveBeenCalledTimes(1);
            const update = mock_send.mock.calls[0][0];
            expect(update.sessions).toHaveLength(1);
            expect(update.sessions[0].id).toBe("win-ok");

            // Error should be logged for claude win failure
            expect(spy).toHaveBeenCalledWith(
                expect.stringContaining("claude read failed"),
                expect.any(String),
            );
            spy.mockRestore();
        });

        it("sends empty update when no sessions found", () => {
            mock_read_costs.mockReturnValue({
                sessions: [],
                new_offset: 0,
                new_size: 0,
            });
            mock_read_opencode_sessions.mockReturnValue([]);

            configure(base_config);

            expect(mock_send).toHaveBeenCalledTimes(1);
            const update = mock_send.mock.calls[0][0];
            expect(update.type).toBe("token_stats_update");
            expect(update.sessions).toEqual([]);
            expect(update.buckets).toEqual([]);
        });

        it("does nothing when no config is set", () => {
            collect();
            expect(mock_send).not.toHaveBeenCalled();
        });

        it("truncates sessions exceeding MAX_RECORDS and logs warning", () => {
            const many_sessions = Array.from({ length: 10001 }, (_, i) =>
                session({ id: `s${String(i)}` }),
            );

            mock_read_costs.mockReturnValue({
                sessions: many_sessions,
                new_offset: 100000,
                new_size: 100000,
            });

            const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => {});

            configure(base_config);

            expect(mock_send).toHaveBeenCalledTimes(1);
            const update = mock_send.mock.calls[0][0];
            expect(update.sessions).toHaveLength(10000);
            expect(warn_spy).toHaveBeenCalledWith(expect.stringContaining("exceed limit"));

            warn_spy.mockRestore();
        });
    });
});
