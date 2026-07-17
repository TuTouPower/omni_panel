/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-empty-function */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock readers ---

const mock_read_costs = vi.fn();
const mock_scan_jsonls = vi.fn();
const mock_read_opencode_sessions = vi.fn();

vi.mock("../../../../../src/main/core/token-stats/claude-reader", () => ({
    read_costs_jsonl: (...args: unknown[]) => mock_read_costs(...args),
    scan_session_jsonls: (...args: unknown[]) => mock_scan_jsonls(...args),
    create_session_scan_state: () => ({ mtimes: new Map(), files: new Map() }),
}));
vi.mock("../../../../../src/main/core/token-stats/opencode-reader", () => ({
    read_opencode_sessions: (...args: unknown[]) => mock_read_opencode_sessions(...args),
}));

// Mock Electron's utilityProcess parentPort (must exist before collector import)
const mock_post_message = vi.fn();
(process as unknown as Record<string, unknown>)["parentPort"] = {
    postMessage: mock_post_message,
    on: vi.fn(),
};

// Import after mocks
import {
    collect,
    configure,
    reset_config,
    costs_state,
    opencode_max_updated,
    jsonl_states,
    claude_costs_path,
    claude_projects_path,
    opencode_path,
    effective_wsl_user,
} from "../../../../../src/main/core/token-stats/collector";
import type {
    TokenStatsConfig,
    TokenStatsSessionUpsert,
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

function upsert(overrides: Partial<TokenStatsSessionUpsert> = {}): TokenStatsSessionUpsert {
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
        calls: null,
        started_at: new Date("2026-07-10T08:00:00Z").getTime(),
        ended_at: new Date("2026-07-10T09:00:00Z").getTime(),
        ...overrides,
    };
}

// --- Tests ---

describe("collector", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        costs_state.clear();
        opencode_max_updated.clear();
        jsonl_states.clear();
        reset_config();

        mock_read_costs.mockReturnValue({ sessions: [], new_offset: 0, new_size: 0 });
        mock_scan_jsonls.mockReturnValue({
            sessions: [],
            daily: [],
            new_state: { mtimes: new Map(), files: new Map() },
        });
        mock_read_opencode_sessions.mockReturnValue({ sessions: [], daily: [] });
    });

    describe("path builders", () => {
        it("builds Win Claude costs path", () => {
            expect(claude_costs_path(base_config, "win")).toBe(
                "C:\\Users\\Test\\.claude\\metrics\\costs.jsonl",
            );
        });

        it("builds WSL Claude costs path", () => {
            expect(claude_costs_path(wsl_config, "wsl")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.claude\\metrics\\costs.jsonl",
            );
        });

        it("builds Win Claude projects path", () => {
            expect(claude_projects_path(base_config, "win")).toBe(
                "C:\\Users\\Test\\.claude\\projects",
            );
        });

        it("builds WSL Claude projects path", () => {
            expect(claude_projects_path(wsl_config, "wsl")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.claude\\projects",
            );
        });

        it("builds Win OpenCode path", () => {
            expect(opencode_path(base_config, "win")).toBe(
                "C:\\Users\\Test\\.local\\share\\opencode\\opencode.db",
            );
        });

        it("builds WSL OpenCode path", () => {
            expect(opencode_path(wsl_config, "wsl")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.local\\share\\opencode\\opencode.db",
            );
        });
    });

    describe("effective_wsl_user", () => {
        it("returns configured user when set", () => {
            expect(effective_wsl_user(wsl_config, () => ["other"])).toBe("testuser");
        });

        it("auto-detects the first home directory when user is empty", () => {
            const cfg = { ...base_config, wsl_enabled: true, wsl_user: "" };
            expect(effective_wsl_user(cfg, () => ["testuser", "root"])).toBe("testuser");
        });

        it("caches the detected user", () => {
            const cfg = { ...base_config, wsl_enabled: true, wsl_user: "" };
            const lister = vi.fn(() => ["testuser"]);
            effective_wsl_user(cfg, lister);
            effective_wsl_user(cfg, lister);
            expect(lister).toHaveBeenCalledTimes(1);
        });

        it("returns empty string when no home directory exists", () => {
            const cfg = { ...base_config, wsl_enabled: true, wsl_user: "" };
            expect(effective_wsl_user(cfg, () => [])).toBe("");
        });
    });

    describe("collect()", () => {
        it("reads all Win sources and posts update", () => {
            mock_read_costs.mockReturnValue({
                sessions: [upsert({ id: "c1" })],
                new_offset: 500,
                new_size: 500,
            });
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "c1", calls: 7, input_tokens: null })],
                daily: [
                    {
                        id: "c1",
                        source: "claude_code",
                        env: "win",
                        model: "m",
                        date: "2026-07-10",
                        input_tokens: 10,
                        output_tokens: 5,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                        calls: 7,
                    },
                ],
                new_state: { mtimes: new Map([["f1", 1]]), files: new Map() },
            });
            mock_read_opencode_sessions.mockReturnValue({
                sessions: [upsert({ id: "o1", source: "opencode" })],
                daily: [],
            });

            configure(base_config);

            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0];
            expect(update.type).toBe("token_stats_update");
            expect(update.sessions).toHaveLength(3);
            expect(update.daily).toHaveLength(1);
            expect(update.daily[0].id).toBe("c1");
        });

        it("tracks incremental state per source kind", () => {
            mock_read_costs.mockReturnValue({
                sessions: [upsert({ id: "c1" })],
                new_offset: 100,
                new_size: 100,
            });
            mock_read_opencode_sessions.mockReturnValue({
                sessions: [upsert({ id: "o1", source: "opencode", ended_at: 1000 })],
                daily: [],
            });

            configure(base_config);

            expect(mock_read_costs).toHaveBeenLastCalledWith(expect.any(String), "win", 0, 0);
            expect(mock_read_opencode_sessions).toHaveBeenLastCalledWith(
                expect.any(String),
                "win",
                0,
            );
            expect(mock_scan_jsonls).toHaveBeenLastCalledWith(
                expect.any(String),
                "win",
                expect.objectContaining({ mtimes: expect.any(Map), files: expect.any(Map) }),
            );

            mock_post_message.mockClear();
            mock_read_costs.mockReturnValue({
                sessions: [upsert({ id: "c2" })],
                new_offset: 200,
                new_size: 200,
            });
            mock_read_opencode_sessions.mockReturnValue({
                sessions: [upsert({ id: "o2", source: "opencode", ended_at: 2000 })],
                daily: [],
            });

            collect();

            expect(mock_read_costs).toHaveBeenLastCalledWith(expect.any(String), "win", 100, 100);
            expect(mock_read_opencode_sessions).toHaveBeenLastCalledWith(
                expect.any(String),
                "win",
                1000,
            );
        });

        it("passes previous scan state to the jsonl scanner", () => {
            const state = { mtimes: new Map([["a.jsonl", 123]]), files: new Map() };
            mock_scan_jsonls.mockReturnValue({ sessions: [], daily: [], new_state: state });

            configure(base_config);
            mock_post_message.mockClear();
            collect();

            expect(mock_scan_jsonls).toHaveBeenLastCalledWith(expect.any(String), "win", state);
        });

        it("skips WSL sources when wsl_enabled=false", () => {
            configure(base_config);

            expect(mock_read_costs).toHaveBeenCalledTimes(1);
            expect(mock_scan_jsonls).toHaveBeenCalledTimes(1);
            expect(mock_read_opencode_sessions).toHaveBeenCalledTimes(1);
            expect(mock_read_costs).toHaveBeenCalledWith(
                expect.stringContaining("Users"),
                "win",
                0,
                0,
            );
        });

        it("reads WSL sources when wsl_enabled=true", () => {
            configure(wsl_config);

            for (const mock of [mock_read_costs, mock_scan_jsonls, mock_read_opencode_sessions]) {
                expect(mock).toHaveBeenCalledTimes(2);
                const wsl_call = mock.mock.calls.find((c: unknown[]) =>
                    String(c[0]).includes("wsl.localhost"),
                );
                expect(wsl_call).toBeDefined();
                expect(wsl_call![1]).toBe("wsl");
            }
        });

        it("one source failure doesn't prevent other sources from being collected", () => {
            mock_read_costs.mockImplementation((_path: string, env: string) => {
                if (env === "win") {
                    throw new Error("file locked");
                }
                return { sessions: [], new_offset: 0, new_size: 0 };
            });
            mock_read_opencode_sessions.mockImplementation((_path: string, env: string) => {
                if (env === "win")
                    return { sessions: [upsert({ id: "win-ok", source: "opencode" })], daily: [] };
                return { sessions: [], daily: [] };
            });

            const spy = vi.spyOn(console, "error").mockImplementation(() => {});
            configure(wsl_config);

            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0];
            expect(update.sessions).toHaveLength(1);
            expect(update.sessions[0]!.id).toBe("win-ok");
            expect(spy).toHaveBeenCalledWith(
                expect.stringContaining("claude_costs_win read failed"),
                expect.any(String),
            );
            spy.mockRestore();
        });

        it("sends empty update when no sessions found", () => {
            configure(base_config);

            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0];
            expect(update.sessions).toEqual([]);
        });

        it("does nothing when no config is set", () => {
            collect();
            expect(mock_post_message).not.toHaveBeenCalled();
        });

        it("truncates sessions exceeding MAX_RECORDS and logs warning", () => {
            const many_sessions = Array.from({ length: 10001 }, (_, i) =>
                upsert({ id: `s${String(i)}` }),
            );
            mock_read_costs.mockReturnValue({
                sessions: many_sessions,
                new_offset: 100000,
                new_size: 100000,
            });

            const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => {});
            configure(base_config);

            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0];
            expect(update.sessions).toHaveLength(10000);
            expect(warn_spy).toHaveBeenCalledWith(expect.stringContaining("exceed limit"));
            warn_spy.mockRestore();
        });
    });
});
