/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock readers ---

const mock_read_costs = vi.fn();
const mock_scan_jsonls = vi.fn();
const mock_read_opencode_sessions = vi.fn();
const mock_scan_kimi = vi.fn();
const mock_scan_grok = vi.fn();

vi.mock("../../../../../src/main/core/token-stats/claude-reader", () => ({
    read_costs_jsonl: (...args: unknown[]) => mock_read_costs(...args),
    scan_session_jsonls: (...args: unknown[]) => mock_scan_jsonls(...args),
    create_session_scan_state: () => ({ mtimes: new Map(), files: new Map() }),
}));
vi.mock("../../../../../src/main/core/token-stats/opencode-reader", () => ({
    read_opencode_sessions: (...args: unknown[]) => mock_read_opencode_sessions(...args),
}));
vi.mock("../../../../../src/main/core/token-stats/kimi-reader", () => ({
    scan_kimi_wire_jsonls: (...args: unknown[]) => mock_scan_kimi(...args),
    create_kimi_scan_state: () => ({ mtimes: new Map(), files: new Map() }),
}));
vi.mock("../../../../../src/main/core/token-stats/grok-reader", () => ({
    scan_grok_updates: (...args: unknown[]) => mock_scan_grok(...args),
    create_grok_scan_state: () => ({ mtimes: new Map(), files: new Map() }),
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
    set_collector_host,
    costs_state,
    opencode_max_updated,
    jsonl_states,
    claude_costs_path,
    claude_projects_path,
    opencode_path,
    kimi_sessions_path,
    kimi_index_path,
    grok_sessions_path,
    effective_wsl_user,
} from "../../../../../src/main/core/token-stats/collector";
import type {
    AgentSessionUsage,
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
    state_path: "",
};

const wsl_config: TokenStatsConfig = {
    ...base_config,
    wsl_enabled: true,
    wsl_user: "karon",
};

function upsert(overrides: Partial<TokenStatsSessionUpsert> = {}): TokenStatsSessionUpsert {
    return {
        id: "s1",
        source: "claude_code",
        env: "local",
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

function record(
    overrides: Partial<AgentSessionUsage> & {
        source?: "claude_code" | "opencode" | "kimi_code" | "grok";
        env?: "local" | "wsl";
    } = {},
): AgentSessionUsage & {
    source: "claude_code" | "opencode" | "kimi_code" | "grok";
    env: "local" | "wsl";
} {
    return {
        session_id: "s1",
        title: null,
        directory: null,
        slug: null,
        version: null,
        parent_session_id: null,
        message_id: "msg-001",
        role: "assistant",
        timestamp: new Date("2026-07-10T08:00:00Z").getTime(),
        model: "claude-sonnet-4-20250514",
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 10,
        cache_write_tokens: 5,
        agent: "claude-code",
        source: "claude_code",
        env: "local",
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
        // Simulate a Windows host so the wsl sources are reachable (t308);
        // non-Windows host behaviour is covered by paths.test.ts and
        // collector-local.test.ts.
        set_collector_host("windows");

        mock_read_costs.mockReturnValue({ sessions: [], records: [], new_offset: 0, new_size: 0 });
        mock_scan_jsonls.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: { mtimes: new Map(), files: new Map() },
        });
        mock_read_opencode_sessions.mockReturnValue({ sessions: [], daily: [], records: [] });
        mock_scan_kimi.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: { mtimes: new Map(), files: new Map() },
        });
        mock_scan_grok.mockReturnValue({
            sessions: [],
            daily: [],
            records: [],
            new_state: { mtimes: new Map(), files: new Map() },
        });
    });

    describe("path builders (t308: host-injected)", () => {
        it("builds local paths from win_home on a windows host", () => {
            expect(claude_costs_path(base_config, "local", "windows")).toBe(
                "C:\\Users\\Test\\.claude\\metrics\\costs.jsonl",
            );
            expect(claude_projects_path(base_config, "local", "windows")).toBe(
                "C:\\Users\\Test\\.claude\\projects",
            );
            expect(opencode_path(base_config, "local", "windows")).toBe(
                "C:\\Users\\Test\\.local\\share\\opencode\\opencode.db",
            );
            expect(kimi_sessions_path(base_config, "local", "windows")).toBe(
                "C:\\Users\\Test\\.kimi-code\\sessions",
            );
            expect(kimi_index_path(base_config, "local", "windows")).toBe(
                "C:\\Users\\Test\\.kimi-code\\session_index.jsonl",
            );
        });

        it("builds POSIX paths from homedir on a non-Windows host (AC-001)", () => {
            expect(claude_costs_path(base_config, "local", "linux", "/home/u")).toBe(
                "/home/u/.claude/metrics/costs.jsonl",
            );
            expect(claude_projects_path(base_config, "local", "linux", "/home/u")).toBe(
                "/home/u/.claude/projects",
            );
            expect(opencode_path(base_config, "local", "linux", "/home/u")).toBe(
                "/home/u/.local/share/opencode/opencode.db",
            );
            expect(kimi_sessions_path(base_config, "local", "linux", "/home/u")).toBe(
                "/home/u/.kimi-code/sessions",
            );
            expect(kimi_index_path(base_config, "local", "linux", "/home/u")).toBe(
                "/home/u/.kimi-code/session_index.jsonl",
            );
        });

        it("builds WSL UNC paths on a windows host (AC-002)", () => {
            expect(claude_costs_path(wsl_config, "wsl", "windows")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.claude\\metrics\\costs.jsonl",
            );
            expect(claude_projects_path(wsl_config, "wsl", "windows")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.claude\\projects",
            );
            expect(opencode_path(wsl_config, "wsl", "windows")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.local\\share\\opencode\\opencode.db",
            );
            expect(kimi_sessions_path(wsl_config, "wsl", "windows")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.kimi-code\\sessions",
            );
            expect(kimi_index_path(wsl_config, "wsl", "windows")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.kimi-code\\session_index.jsonl",
            );
        });

        it("returns null for wsl sources on a non-Windows host (AC-001)", () => {
            expect(claude_costs_path(wsl_config, "wsl", "linux")).toBeNull();
            expect(claude_projects_path(wsl_config, "wsl", "linux")).toBeNull();
            expect(opencode_path(wsl_config, "wsl", "linux")).toBeNull();
            expect(kimi_sessions_path(wsl_config, "wsl", "linux")).toBeNull();
            expect(kimi_index_path(wsl_config, "wsl", "linux")).toBeNull();
        });

        it("returns null for wsl sources when wsl_user is undetectable on a windows host (AC-003)", () => {
            const cfg = { ...wsl_config, wsl_user: "" };
            expect(claude_costs_path(cfg, "wsl", "windows")).toBeNull();
            expect(claude_projects_path(cfg, "wsl", "windows")).toBeNull();
            expect(opencode_path(cfg, "wsl", "windows")).toBeNull();
            expect(kimi_sessions_path(cfg, "wsl", "windows")).toBeNull();
            expect(kimi_index_path(cfg, "wsl", "windows")).toBeNull();
        });

        it("builds WSL grok sessions path (t197); null on non-Windows hosts", () => {
            expect(grok_sessions_path(wsl_config, "windows")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.grok\\sessions",
            );
            expect(grok_sessions_path(wsl_config, "linux")).toBeNull();
        });
    });

    describe("effective_wsl_user", () => {
        it("returns configured user when set", () => {
            expect(effective_wsl_user(wsl_config, () => ["other"])).toBe("karon");
        });

        it("auto-detects the first home directory when user is empty", () => {
            const cfg = { ...base_config, wsl_enabled: true, wsl_user: "" };
            expect(effective_wsl_user(cfg, () => ["karon", "root"])).toBe("karon");
        });

        it("caches the detected user", () => {
            const cfg = { ...base_config, wsl_enabled: true, wsl_user: "" };
            const lister = vi.fn(() => ["karon"]);
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
        it("reads all local sources and posts update", () => {
            mock_read_costs.mockReturnValue({
                sessions: [upsert({ id: "c1" })],
                records: [record({ message_id: "costs-r1", agent: "claude-code" })],
                new_offset: 500,
                new_size: 500,
            });
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "c1", calls: 7, input_tokens: null })],
                daily: [
                    {
                        id: "c1",
                        source: "claude_code",
                        env: "local",
                        model: "m",
                        date: "2026-07-10",
                        input_tokens: 10,
                        output_tokens: 5,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                        calls: 7,
                    },
                ],
                records: [record({ message_id: "jsonl-r1", agent: "claude-code" })],
                new_state: { mtimes: new Map([["f1", 1]]), files: new Map() },
            });
            mock_read_opencode_sessions.mockReturnValue({
                sessions: [upsert({ id: "o1", source: "opencode" })],
                daily: [],
                records: [record({ message_id: "oc-r1", agent: "opencode" })],
            });
            mock_scan_kimi.mockReturnValue({
                sessions: [upsert({ id: "k1", source: "kimi_code" })],
                daily: [],
                records: [record({ message_id: "kimi-r1", agent: "kimi-code" })],
                new_state: { mtimes: new Map(), files: new Map() },
            });

            configure(base_config);

            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0] as {
                type: string;
                sessions: unknown[];
                daily: { id: string }[];
                records: AgentSessionUsage[];
            };
            expect(update.type).toBe("token_stats_update");
            expect(update.sessions).toHaveLength(4);
            expect(update.daily).toHaveLength(1);
            expect(update.daily[0]!.id).toBe("c1");
            // costs.jsonl carries cumulative snapshots, not per-message records
            expect(update.records).toHaveLength(3);
            expect(update.records.map((r) => r.message_id).sort()).toEqual([
                "jsonl-r1",
                "kimi-r1",
                "oc-r1",
            ]);
        });

        it("emits only newly-seen records on subsequent collects (message_id diff)", () => {
            // First collect: reader returns 2 records for session s1.
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                daily: [],
                records: [
                    record({ message_id: "m1", source: "claude_code", env: "local" }),
                    record({ message_id: "m2", source: "claude_code", env: "local" }),
                ],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            const first = mock_post_message.mock.calls[0]![0] as {
                records: AgentSessionUsage[];
            };
            expect(first.records).toHaveLength(2);

            // Second collect: same 2 records re-emitted by reader (mtime unchanged
            // would normally skip, but simulate a dirty session that re-merges),
            // plus 1 new record. Only the new one should be posted.
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                daily: [],
                records: [
                    record({ message_id: "m1", source: "claude_code", env: "local" }),
                    record({ message_id: "m2", source: "claude_code", env: "local" }),
                    record({ message_id: "m3", source: "claude_code", env: "local" }),
                ],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            collect();
            const second = mock_post_message.mock.calls[1]![0] as {
                records: AgentSessionUsage[];
            };
            expect(second.records).toHaveLength(1);
            expect(second.records[0]!.message_id).toBe("m3");
        });

        it("emits nothing when no records changed since the last collect", () => {
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                daily: [],
                records: [
                    record({ message_id: "m1", source: "claude_code", env: "local" }),
                    record({ message_id: "m2", source: "claude_code", env: "local" }),
                ],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            // First collect emits both.
            const first = mock_post_message.mock.calls[0]![0] as {
                records: AgentSessionUsage[];
            };
            expect(first.records).toHaveLength(2);

            // Second collect returns the identical set -> 0 emitted.
            collect();
            const second = mock_post_message.mock.calls[1]![0] as {
                records: AgentSessionUsage[];
            };
            expect(second.records).toHaveLength(0);
        });

        it("does not dedup records that share message_id across source/env", () => {
            // Same message_id "shared" under different (source, env) is two
            // distinct PK rows; both must emit.
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                daily: [],
                records: [
                    record({ message_id: "shared", source: "claude_code", env: "local" }),
                    record({
                        message_id: "shared",
                        source: "claude_code",
                        env: "wsl",
                        agent: "claude-code",
                    }),
                    record({
                        message_id: "shared",
                        source: "opencode",
                        env: "local",
                        agent: "opencode",
                    }),
                ],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            const update = mock_post_message.mock.calls[0]![0] as {
                records: AgentSessionUsage[];
            };
            expect(update.records).toHaveLength(3);
        });

        it("re-emits a record after the emitted set is reset (file-truncation analog)", () => {
            // Files truncated and rewritten would reuse old message_ids. The
            // in-memory set is wiped on reset_config (restart equivalent), so a
            // post-restart collect re-emits everything - mirroring full rescan.
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                daily: [],
                records: [record({ message_id: "m1", source: "claude_code", env: "local" })],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            expect(
                (mock_post_message.mock.calls[0]![0] as { records: AgentSessionUsage[] }).records,
            ).toHaveLength(1);

            reset_config();
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                daily: [],
                records: [record({ message_id: "m1", source: "claude_code", env: "local" })],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            expect(
                (mock_post_message.mock.calls[1]![0] as { records: AgentSessionUsage[] }).records,
            ).toHaveLength(1);
        });

        it("tracks incremental state per source kind", () => {
            mock_read_costs.mockReturnValue({
                sessions: [upsert({ id: "c1" })],
                records: [],
                new_offset: 100,
                new_size: 100,
            });
            mock_read_opencode_sessions.mockReturnValue({
                sessions: [upsert({ id: "o1", source: "opencode", ended_at: 1000 })],
                daily: [],
                records: [],
            });

            configure(base_config);

            expect(mock_read_costs).toHaveBeenLastCalledWith(expect.any(String), "local", 0, 0);
            expect(mock_read_opencode_sessions).toHaveBeenLastCalledWith(
                expect.any(String),
                "local",
                0,
            );
            expect(mock_scan_jsonls).toHaveBeenLastCalledWith(
                expect.any(String),
                "local",
                expect.objectContaining({ mtimes: expect.any(Map), files: expect.any(Map) }),
            );

            mock_post_message.mockClear();
            mock_read_costs.mockReturnValue({
                sessions: [upsert({ id: "c2" })],
                records: [],
                new_offset: 200,
                new_size: 200,
            });
            mock_read_opencode_sessions.mockReturnValue({
                sessions: [upsert({ id: "o2", source: "opencode", ended_at: 2000 })],
                daily: [],
                records: [],
            });

            collect();

            expect(mock_read_costs).toHaveBeenLastCalledWith(expect.any(String), "local", 100, 100);
            expect(mock_read_opencode_sessions).toHaveBeenLastCalledWith(
                expect.any(String),
                "local",
                1000,
            );
        });

        it("passes previous scan state to the jsonl scanner", () => {
            const state = { mtimes: new Map([["a.jsonl", 123]]), files: new Map() };
            mock_scan_jsonls.mockReturnValue({
                sessions: [],
                daily: [],
                records: [],
                new_state: state,
            });

            configure(base_config);
            mock_post_message.mockClear();
            collect();

            expect(mock_scan_jsonls).toHaveBeenLastCalledWith(expect.any(String), "local", state);
        });

        it("skips WSL sources when wsl_enabled=false", () => {
            configure(base_config);

            expect(mock_read_costs).toHaveBeenCalledTimes(1);
            expect(mock_scan_jsonls).toHaveBeenCalledTimes(1);
            expect(mock_read_opencode_sessions).toHaveBeenCalledTimes(1);
            expect(mock_scan_kimi).toHaveBeenCalledTimes(1);
            // grok is WSL-only: never read when wsl_enabled=false (t197)
            expect(mock_scan_grok).not.toHaveBeenCalled();
            expect(mock_read_costs).toHaveBeenCalledWith(
                expect.stringContaining("Users"),
                "local",
                0,
                0,
            );
        });

        it("reads WSL sources when wsl_enabled=true", () => {
            configure(wsl_config);

            for (const mock of [
                mock_read_costs,
                mock_scan_jsonls,
                mock_read_opencode_sessions,
                mock_scan_kimi,
            ]) {
                expect(mock).toHaveBeenCalledTimes(2);
                const wsl_call = mock.mock.calls.find((c: unknown[]) =>
                    String(c[0]).includes("wsl.localhost"),
                );
                expect(wsl_call).toBeDefined();
                expect(wsl_call![1]).toBe("wsl");
            }
        });

        it("reads the grok source only under WSL and posts its rows (t197)", () => {
            mock_scan_grok.mockReturnValue({
                sessions: [
                    {
                        id: "grok-s1",
                        source: "grok",
                        env: "wsl",
                        model: "grok-4.5-build",
                        title: "github_repo",
                        directory: "/home/karon/github_repo",
                        input_tokens: 100,
                        output_tokens: 52,
                        cache_read_tokens: 20,
                        cache_write_tokens: 0,
                        calls: 1,
                        started_at: 1,
                        ended_at: 2,
                    },
                ],
                daily: [
                    {
                        id: "grok-s1",
                        source: "grok",
                        env: "wsl",
                        model: "grok-4.5-build",
                        date: "2026-07-27",
                        input_tokens: 100,
                        output_tokens: 52,
                        cache_read_tokens: 20,
                        cache_write_tokens: 0,
                        calls: 1,
                    },
                ],
                records: [
                    record({
                        message_id: "grok-r1",
                        source: "grok",
                        env: "wsl",
                        agent: "grok",
                    }),
                ],
                new_state: { mtimes: new Map([["g", 1]]), files: new Map() },
            });

            configure(wsl_config);

            expect(mock_scan_grok).toHaveBeenCalledTimes(1);
            const call = mock_scan_grok.mock.calls[0]!;
            expect(String(call[0])).toContain("wsl.localhost");
            expect(String(call[0])).toContain(".grok\\sessions");
            expect(call[1]).toBe("wsl");

            const update = mock_post_message.mock.calls[0]![0] as {
                sessions: unknown[];
                daily: unknown[];
                records: AgentSessionUsage[];
            };
            const grok_sessions = update.sessions.filter(
                (s) => (s as { source: string }).source === "grok",
            );
            expect(grok_sessions).toHaveLength(1);
            expect(update.daily).toHaveLength(1);
            expect(update.records[0]).toMatchObject({ source: "grok", agent: "grok" });
        });

        it("warns once when the grok sessions dir is missing and still collects others (t197 AC5)", () => {
            mock_scan_grok.mockReturnValue({
                sessions: [],
                daily: [],
                records: [],
                new_state: { mtimes: new Map(), files: new Map() },
                missing: true,
            });
            mock_scan_kimi.mockReturnValue({
                sessions: [upsert({ id: "k1", source: "kimi_code" })],
                daily: [],
                records: [],
                new_state: { mtimes: new Map(), files: new Map() },
            });

            configure(wsl_config);

            // token_stats_update + one collector_log warn (grok missing).
            expect(mock_post_message).toHaveBeenCalledTimes(2);
            const log_msg = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "collector_log",
            )?.[0] as { type: string; level: string; module: string; message: string } | undefined;
            expect(log_msg?.level).toBe("warn");
            expect(log_msg?.message).toContain("grok_wsl sessions dir missing");
            // Other sources still collected.
            const update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(
                update.sessions.some((s) => (s as { source: string }).source === "kimi_code"),
            ).toBe(true);

            // Second collect: warn fires only once.
            mock_post_message.mockClear();
            collect();
            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const second = mock_post_message.mock.calls[0]![0] as { type?: string };
            expect(second.type).toBe("token_stats_update");
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

            configure(base_config);

            // token_stats_update + one forwarded collector_log warn (D7)
            expect(mock_post_message).toHaveBeenCalledTimes(2);
            const update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(update.sessions).toHaveLength(10000);
            const log_msg = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "collector_log",
            )?.[0] as { level: string; message: string } | undefined;
            expect(log_msg?.level).toBe("warn");
            expect(log_msg?.message).toContain("exceed limit");
        });
    });

    describe("source status visibility (t309)", () => {
        function posted_updates(): {
            sessions: { id: string }[];
            sources_status: {
                source: string;
                env: string;
                status: string;
                lastError?: string;
            }[];
        }[] {
            return mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "token_stats_update")
                .map(
                    (c) =>
                        c[0] as {
                            sessions: { id: string }[];
                            sources_status: {
                                source: string;
                                env: string;
                                status: string;
                                lastError?: string;
                            }[];
                        },
                );
        }

        function posted_logs(): { level: string; message: string }[] {
            return mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "collector_log")
                .map((c) => c[0] as { level: string; message: string });
        }

        it("AC-001: non-Windows host filters wsl sources out without reading them and marks them unavailable", () => {
            set_collector_host("linux");
            configure(wsl_config);

            // wsl sources never reach the readers (no path building, no reads).
            const read_calls = [
                ...mock_read_costs.mock.calls,
                ...mock_scan_jsonls.mock.calls,
                ...mock_read_opencode_sessions.mock.calls,
                ...mock_scan_kimi.mock.calls,
                ...mock_scan_grok.mock.calls,
            ];
            expect(read_calls.some((c) => String(c[0]).includes("wsl.localhost"))).toBe(false);

            const update = posted_updates()[0]!;
            const wsl_statuses = update.sources_status.filter((s) => s.env === "wsl");
            expect(wsl_statuses).toHaveLength(5);
            for (const s of wsl_statuses) {
                expect(s.status).toBe("unavailable");
                expect(s.lastError).toContain("windows host");
            }
            // Local sources stay healthy.
            const local_statuses = update.sources_status.filter((s) => s.env === "local");
            expect(local_statuses).toHaveLength(4);
            expect(local_statuses.every((s) => s.status === "ok")).toBe(true);

            // AC-003: one warn per unavailable source, keyed with source/env + reason.
            const warns = posted_logs();
            expect(warns).toHaveLength(5);
            for (const w of warns) {
                expect(w.level).toBe("warn");
                expect(w.message).toMatch(/unavailable: wsl data requires a windows host/);
            }
        });

        it("AC-002/AC-003: a throwing reader is marked failed with the error and warns once", () => {
            set_collector_host("windows");
            mock_read_costs.mockImplementation((_path: string, env: string) => {
                if (env === "local") throw new Error("file locked");
                return { sessions: [], records: [], new_offset: 0, new_size: 0 };
            });
            mock_read_opencode_sessions.mockImplementation((_path: string, env: string) => {
                if (env === "local") {
                    return {
                        sessions: [upsert({ id: "win-ok", source: "opencode" })],
                        daily: [],
                        records: [],
                    };
                }
                return { sessions: [], daily: [], records: [] };
            });

            configure(wsl_config);

            const update = posted_updates()[0]!;
            const failed = update.sources_status.find(
                (s) => s.source === "claude_code" && s.env === "local",
            );
            expect(failed?.status).toBe("failed");
            expect(failed?.lastError).toContain("file locked");
            // Other sources still collected and reported ok.
            expect(update.sessions.some((s) => s.id === "win-ok")).toBe(true);
            const ok_source = update.sources_status.find(
                (s) => s.source === "opencode" && s.env === "local",
            );
            expect(ok_source?.status).toBe("ok");

            // AC-003: warn carries source key + reason; fires exactly once per source.
            const warns = posted_logs();
            expect(warns).toHaveLength(1);
            expect(warns[0]?.level).toBe("warn");
            expect(warns[0]?.message).toContain("claude_costs_local");
            expect(warns[0]?.message).toContain("file locked");

            mock_post_message.mockClear();
            collect();
            expect(posted_logs()).toHaveLength(0);
        });

        it("AC-002: a source whose path resolves to null is unavailable with the reason", () => {
            set_collector_host("windows");
            // Undetectable wsl user → every wsl path resolves to null (t308).
            configure({ ...wsl_config, wsl_user: "" });

            const update = posted_updates()[0]!;
            const wsl_statuses = update.sources_status.filter((s) => s.env === "wsl");
            expect(wsl_statuses).toHaveLength(5);
            for (const s of wsl_statuses) {
                expect(s.status).toBe("unavailable");
                expect(s.lastError).toBe("path unavailable");
            }
            const warns = posted_logs();
            expect(warns).toHaveLength(5);
            expect(warns[0]?.message).toContain("unavailable: path unavailable");
        });

        it("AC-003: healthy sources produce no warn logs and report ok status", () => {
            set_collector_host("windows");
            configure(base_config);

            expect(posted_logs()).toHaveLength(0);
            const update = posted_updates()[0]!;
            expect(update.sources_status).toHaveLength(4);
            expect(update.sources_status.every((s) => s.status === "ok")).toBe(true);
        });
    });
});
