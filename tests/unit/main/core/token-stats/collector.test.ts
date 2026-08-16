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

const mock_scan_save = vi.fn();
vi.mock("../../../../../src/main/core/token-stats/scan-state", async (importOriginal) => {
    const actual = await importOriginal<typeof ScanStateModule>();
    return {
        ...actual,
        save_state: (...args: unknown[]) => mock_scan_save(...args),
    };
});
import type * as ScanStateModule from "../../../../../src/main/core/token-stats/scan-state";

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
    source_cursors,
    emitted_record_keys,
    session_touch_ts,
    claude_costs_path,
    claude_projects_path,
    opencode_path,
    kimi_sessions_path,
    kimi_index_path,
    grok_sessions_path,
    effective_wsl_user,
    EMITTED_WINDOW_MS,
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
        source_cursors.clear();
        emitted_record_keys.clear();
        session_touch_ts.clear();
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
            expect(grok_sessions_path(wsl_config, "wsl", "windows")).toBe(
                "\\\\wsl.localhost\\Ubuntu-22.04\\home\\karon\\.grok\\sessions",
            );
            expect(grok_sessions_path(wsl_config, "wsl", "linux")).toBeNull();
        });

        it("t426: resolves local grok sessions path on non-Windows hosts (AC-002)", () => {
            expect(grok_sessions_path(base_config, "local", "linux", "/home/u")).toBe(
                "/home/u/.grok/sessions",
            );
            expect(grok_sessions_path(base_config, "local", "macos", "/Users/u")).toBe(
                "/Users/u/.grok/sessions",
            );
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

        it("does not cache an empty detection, retrying next call (t345 AC-006)", () => {
            const cfg = { ...base_config, wsl_enabled: true, wsl_user: "" };
            const lister = vi.fn().mockReturnValueOnce([]).mockReturnValueOnce(["karon"]);
            // 首轮空结果 → 返回 "" 但不缓存。
            expect(effective_wsl_user(cfg, lister)).toBe("");
            // 第二轮探测到用户 → 返回并缓存（lister 被再次调用）。
            expect(effective_wsl_user(cfg, lister)).toBe("karon");
            expect(lister).toHaveBeenCalledTimes(2);
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

        it("re-emits records when postMessage fails (t345 AC-004 / t393 AC-001)", () => {
            // 真实增量 mock：scan-state 已推进（jsonl_states 有该源）→ 返回 []（无变化）；
            // state 缺失（回滚或首扫）→ 重扫重产出 2 条。mock 不再恒返回同 2 条，
            // 使「回滚 → 重扫 → 重发」闭环对回滚是否必需敏感。
            mock_scan_jsonls.mockImplementation(() => {
                if (jsonl_states.has("claude_jsonl_local")) {
                    return { sessions: [], daily: [], records: [], new_state: { mtimes: new Map(), files: new Map() } };
                }
                return {
                    sessions: [upsert({ id: "s1" })],
                    daily: [],
                    records: [
                        record({ message_id: "m1", source: "claude_code", env: "local" }),
                        record({ message_id: "m2", source: "claude_code", env: "local" }),
                    ],
                    new_state: { mtimes: new Map(), files: new Map() },
                };
            });
            // 首轮 postMessage 抛错（发送失败）。
            mock_post_message.mockImplementationOnce(() => {
                throw new Error("port gone");
            });
            configure(base_config);
            // 首轮失败后 jsonl_states 被回滚（key 删除），下轮可全量重扫。
            expect(jsonl_states.has("claude_jsonl_local")).toBe(false);

            // 第二轮：若未回滚，scan-state 已推进 → mock 返回 [] → 不重发。
            // 因首轮已回滚 → 重扫重产出 2 条并重发。
            mock_post_message.mockClear();
            collect();
            const second = mock_post_message.mock.calls[0]![0] as {
                records: AgentSessionUsage[];
            };
            // 失败轮 records 下一轮重发。
            expect(second.records).toHaveLength(2);
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
            // t426: grok 现在有 local 源（随宿主安装），wsl_enabled=false 只跳过
            // grok_wsl；grok_local 在 windows 宿主读 win_home\.grok（t197 断言更新）。
            expect(mock_scan_grok).toHaveBeenCalledTimes(1);
            expect(String(mock_scan_grok.mock.calls[0]![0])).toContain("Users");
            expect(mock_scan_grok.mock.calls[0]![1]).toBe("local");
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

        it("t426: host=linux source list includes local grok and collects it (AC-001)", () => {
            set_collector_host("linux");
            mock_scan_grok.mockReturnValue({
                sessions: [
                    {
                        id: "grok-local-s1",
                        source: "grok",
                        env: "local",
                        model: "grok-4.5-build",
                        title: "local_grok_repo",
                        directory: "/home/karon/github_repo",
                        input_tokens: 10,
                        output_tokens: 5,
                        cache_read_tokens: 0,
                        cache_write_tokens: 0,
                        calls: 1,
                        started_at: 1,
                        ended_at: 2,
                    },
                ],
                daily: [],
                records: [
                    record({ message_id: "grok-local-r1", source: "grok", env: "local", agent: "grok" }),
                ],
                new_state: { mtimes: new Map([["g", 1]]), files: new Map() },
            });

            configure(base_config);

            // grok_local 参与采集：reader 被调用，路径为 local 解析（非 UNC）。
            expect(mock_scan_grok).toHaveBeenCalledTimes(1);
            const call = mock_scan_grok.mock.calls[0]!;
            // 相对 os.homedir() 的 local 路径（不硬编码具体 home，CI 机器无关）。
            const p = String(call[0]);
            expect(p.endsWith("/.grok/sessions")).toBe(true);
            expect(p).not.toContain("wsl.localhost");
            expect(call[1]).toBe("local");

            const update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as {
                sessions: { id: string; env: string; source: string }[];
                records: AgentSessionUsage[];
            };
            expect(
                update.sessions.some(
                    (s) => s.id === "grok-local-s1" && s.env === "local" && s.source === "grok",
                ),
            ).toBe(true);
            expect(update.records.some((r) => r.message_id === "grok-local-r1")).toBe(true);
        });

        it("reads the grok wsl source under WSL and posts its rows (t197)", () => {
            // t426: grok 双源——windows 宿主上 grok_local 读 win_home（通常缺失），
            // grok_wsl 走 UNC。按 path 区分 mock：local 返回空、wsl 返回数据。
            mock_scan_grok.mockImplementation((_p: string, env: string) => {
                if (env === "local") {
                    return { sessions: [], daily: [], records: [], new_state: { mtimes: new Map(), files: new Map() } };
                }
                return {
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
                };
            });

            configure(wsl_config);

            // 两个 grok 源都参与：grok_local（win_home）+ grok_wsl（UNC）。
            expect(mock_scan_grok).toHaveBeenCalledTimes(2);
            const wsl_call = mock_scan_grok.mock.calls.find((c: unknown[]) =>
                String(c[0]).includes("wsl.localhost"),
            );
            expect(wsl_call).toBeDefined();
            expect(String(wsl_call![0])).toContain(".grok\\sessions");
            expect(wsl_call![1]).toBe("wsl");

            const update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as {
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
            // t426: grok 双源——wsl_config + windows host 下 grok_local（win_home）
            // 与 grok_wsl（UNC）都 missing，各 warn 一次。
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

            // token_stats_update + two collector_log warns (grok_local + grok_wsl missing).
            expect(mock_post_message).toHaveBeenCalledTimes(3);
            const log_msgs = mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "collector_log")
                .map((c) => c[0] as { type: string; level: string; module: string; message: string });
            expect(log_msgs).toHaveLength(2);
            expect(log_msgs.every((l) => l.level === "warn")).toBe(true);
            expect(log_msgs.some((l) => l.message.includes("grok_wsl sessions dir missing"))).toBe(
                true,
            );
            expect(log_msgs.some((l) => l.message.includes("grok_local sessions dir missing"))).toBe(
                true,
            );
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

        it("marks grok failed with partial data when some files are unreadable (t345 AC-001)", () => {
            mock_scan_grok.mockReturnValue({
                sessions: [upsert({ id: "grok-partial", source: "grok" })],
                daily: [],
                records: [record({ message_id: "grok-r1", source: "grok", env: "wsl" })],
                new_state: { mtimes: new Map(), files: new Map() },
                missing: false,
                file_unreadable: true,
            });
            configure(wsl_config);

            const update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as {
                sessions: { id: string }[];
                sources_status: { source: string; env: string; status: string }[];
            };
            // 部分不可读 → 已解析部分仍投递，非丢弃。
            expect(update.sessions.some((s) => s.id === "grok-partial")).toBe(true);
            // 状态为 failed（而非 unavailable）。
            const grok_status = update.sources_status.find((s) => s.source === "grok");
            expect(grok_status?.status).toBe("failed");
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

        it("does not starve later sources when a source truncates (t345 AC-003)", () => {
            // claude_costs 返回 20000 sessions（超 MAX_RECORDS=10000）→ 截断。
            mock_read_costs.mockReturnValue({
                sessions: Array.from({ length: 20000 }, (_, i) => upsert({ id: `s${String(i)}` })),
                new_offset: 200000,
                new_size: 200000,
            });
            // kimi 正常返回 1 session——截断后仍应被收集（不 break 饿死）。
            mock_scan_kimi.mockReturnValue({
                sessions: [upsert({ id: "kimi-ok", source: "kimi_code" })],
                daily: [],
                records: [],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);

            const update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(update.sessions).toHaveLength(10000);
            // 后续 source 未被饿死：kimi 仍被读取（不 break）。
            expect(mock_scan_kimi).toHaveBeenCalled();
        });

        it("advances the truncation cursor across rounds so no session is lost (t345 AC-003 + t385 AC-001)", () => {
            // claude_costs 恒返回 20000 sessions（单源持续超限）。
            const sessions = Array.from({ length: 20000 }, (_, i) =>
                upsert({ id: `s${String(i)}` }),
            );
            mock_read_costs.mockReturnValue({
                sessions,
                new_offset: 200000,
                new_size: 200000,
            });
            configure(base_config);

            // 首轮：发前 10000，游标身份集合含 s0..s9999。
            let update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(update.sessions).toHaveLength(10000);
            const cursor = source_cursors.get("claude_costs_local");
            expect(cursor?.sessions.size).toBe(10000);
            expect(cursor?.sessions.has("s0")).toBe(true);

            // 第二轮：跳过已发出的 s0..s9999（身份集合），发 s10000..。
            mock_post_message.mockClear();
            collect();
            update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(update.sessions).toHaveLength(10000);
            expect(update.sessions[0]).toMatchObject({ id: "s10000" });

            // 第三轮：20000 全部发完，游标清除。
            mock_post_message.mockClear();
            collect();
            update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(update.sessions).toHaveLength(0);
            expect(source_cursors.has("claude_costs_local")).toBe(false);
        });

        it("t385 AC-002: 截断期间新会话排序在游标前仍被扫描入列（身份键非位置计数）", () => {
            const sessions = Array.from({ length: 20000 }, (_, i) =>
                upsert({ id: `s${String(i)}` }),
            );
            // 首轮 20000 截断；第二轮 reader 排序序中插入新会话 aa（排在 s0 前）。
            mock_read_costs
                .mockReturnValueOnce({
                    sessions,
                    new_offset: 200000,
                    new_size: 200000,
                })
                .mockReturnValueOnce({
                    sessions: [upsert({ id: "aa" }), ...sessions],
                    new_offset: 200000,
                    new_size: 200000,
                });
            configure(base_config);

            let update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(update.sessions).toHaveLength(10000);
            // 首轮游标 = {s0..s9999}（身份键）
            expect(source_cursors.get("claude_costs_local")?.sessions.has("s0")).toBe(true);

            // 第二轮：位置计数会跳过 aa（排在最前），身份键不误跳 → aa 被推入。
            mock_post_message.mockClear();
            collect();
            update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(update.sessions.some((s) => (s as { id?: string }).id === "aa")).toBe(true);
        });

        it("t385 AC-003: postMessage 失败按快照恢复游标（轮前值保留），下轮续推不重发已入列前缀", () => {
            const sessions = Array.from({ length: 20000 }, (_, i) =>
                upsert({ id: `s${String(i)}` }),
            );
            mock_read_costs.mockReturnValue({
                sessions,
                new_offset: 200000,
                new_size: 200000,
            });
            configure(base_config);
            // 首轮成功：截断，游标 = {s0..s9999}。
            expect(source_cursors.get("claude_costs_local")?.sessions.size).toBe(10000);

            // 第二轮 postMessage 抛错。
            mock_post_message.mockClear();
            mock_post_message.mockImplementationOnce(() => {
                throw new Error("port gone");
            });
            collect();
            // 快照恢复：游标回到轮前值（s0..s9999 仍在，非删除）。
            expect(source_cursors.get("claude_costs_local")?.sessions.size).toBe(10000);

            // 第三轮续推 s10000..，不重发 s0..s9999（幂等）。
            mock_post_message.mockClear();
            collect();
            const third = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            expect(third.sessions[0]).toMatchObject({ id: "s10000" });
        });

        it("rolls back the truncation cursor on postMessage failure (t345 AC-004/f009)", () => {
            // 截断 + postMessage 失败组合：首轮 20000 sessions 截断，游标置 10000，
            // postMessage 抛错 → 游标应回滚，下轮全量重发（含 s0..s9999）。
            const sessions = Array.from({ length: 20000 }, (_, i) =>
                upsert({ id: `s${String(i)}` }),
            );
            mock_read_costs.mockReturnValue({
                sessions,
                new_offset: 200000,
                new_size: 200000,
            });
            mock_post_message.mockImplementationOnce(() => {
                throw new Error("port gone");
            });
            configure(base_config);

            // 首轮失败后游标回滚（删除），下轮可全量重扫从 s0 开始。
            expect(source_cursors.has("claude_costs_local")).toBe(false);

            mock_post_message.mockClear();
            collect();
            const second = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { sessions: unknown[] };
            // 失败轮 s0..s9999 重发（游标回滚 → 从 s0 重扫）。
            expect(second.sessions[0]).toMatchObject({ id: "s0" });
            expect(second.sessions).toHaveLength(10000);
        });

        it("t393 AC-002: daily 截断游标跨轮推进（对齐 session 维度截断用例）", () => {
            // 51000 条 daily 超 MAX_RECORDS*5=50000 → 截断；感知 scan-state 的
            // mock：state 已推进（jsonl_states 有该源）→ 返回 []，回滚/未推进 → 全量。
            const daily_rows = Array.from({ length: 51000 }, (_, i) => ({
                id: `d${String(i)}`,
                source: "claude_code" as const,
                env: "local" as const,
                model: "m",
                date: "2026-07-10",
                input_tokens: 10,
                output_tokens: 5,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 1,
            }));
            mock_scan_jsonls.mockImplementation(() => {
                if (jsonl_states.has("claude_jsonl_local")) {
                    return {
                        sessions: [],
                        daily: [],
                        records: [],
                        new_state: { mtimes: new Map(), files: new Map() },
                    };
                }
                return {
                    sessions: [],
                    daily: daily_rows,
                    records: [],
                    new_state: { mtimes: new Map(), files: new Map() },
                };
            });
            configure(base_config);

            // 首轮：发前 50000，游标 daily 身份键含 d0..d49999。
            let update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { daily: { id: string }[] };
            expect(update.daily).toHaveLength(50000);
            const cursor = source_cursors.get("claude_jsonl_local");
            expect(cursor?.daily.size).toBe(50000);
            expect(cursor?.daily.has("d0|2026-07-10|m")).toBe(true);

            // 第二轮：跳过已发 d0..d49999（身份键），发 d50000..；未截断游标清除。
            mock_post_message.mockClear();
            collect();
            update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { daily: { id: string }[] };
            expect(update.daily).toHaveLength(1000);
            expect(update.daily[0]!.id).toBe("d50000");
            expect(source_cursors.has("claude_jsonl_local")).toBe(false);

            // 第三轮：scan-state 已推进 → mock 返回 []，无输出。
            mock_post_message.mockClear();
            collect();
            update = mock_post_message.mock.calls.find(
                (c) => (c[0] as { type?: string }).type === "token_stats_update",
            )?.[0] as { daily: { id: string }[] };
            expect(update.daily).toHaveLength(0);
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
            // t426: grok_local 加入 local 源清单（5 个 local 源）。
            expect(local_statuses).toHaveLength(5);
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
            // t426: 5 个 local 源（claude_costs/claude_jsonl/opencode/kimi/grok）。
            expect(update.sources_status).toHaveLength(5);
            expect(update.sources_status.every((s) => s.status === "ok")).toBe(true);
        });
    });

    describe("bounded memory (t346)", () => {
        it("prunes emitted records older than the window (t346 AC-001)", () => {
            const now = Date.now();
            // 注入旧（>7d）与新的 key。
            emitted_record_keys.set("old|local|m-old", now - 31 * 24 * 60 * 60 * 1000);
            emitted_record_keys.set("fresh|local|m-fresh", now);

            // 无数据 collect 也触发 prune_emitted。
            configure(base_config);

            expect(emitted_record_keys.has("old|local|m-old")).toBe(false);
            expect(emitted_record_keys.has("fresh|local|m-fresh")).toBe(true);
        });

        it("newly emitted records carry a timestamp and are bounded by the window", () => {
            const now = Date.now();
            emitted_record_keys.set("old|local|m-old", now - 31 * 24 * 60 * 60 * 1000);
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                daily: [],
                records: [record({ message_id: "m1", source: "claude_code", env: "local" })],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            collect();

            // 新记录写入时间戳（key 含会话维度，t386 AC-003）；旧记录仍被裁剪。
            expect(emitted_record_keys.has("claude_code|local|s1|m1")).toBe(true);
            expect(emitted_record_keys.has("old|local|m-old")).toBe(false);
        });

        it("t386 AC-001: 活跃长会话 key 过窗但会话活跃 → 保留（不整段重发）", () => {
            const now = Date.now();
            // 4 段 key（含会话维度）已过窗 31 天。
            emitted_record_keys.set(
                "claude_code|local|sess-active|m-old",
                now - 31 * 24 * 60 * 60 * 1000,
            );
            // 会话活跃：mock reader 返回该会话，collect 刷新 session_touch_ts（生产路径）。
            mock_scan_jsonls.mockReturnValue({
                sessions: [upsert({ id: "sess-active" })],
                daily: [],
                records: [],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            collect();
            // prune 后活跃会话 key 保留（下次只发新增，不重发整段）。
            expect(emitted_record_keys.has("claude_code|local|sess-active|m-old")).toBe(true);
            // touch 键含 source|env 前缀（生产刷新路径设）。
            expect(session_touch_ts.get("claude_code|local|sess-active")).toBeGreaterThan(
                now - 1000,
            );
        });

        it("t386 AC-002: 非活跃会话 key 过窗删除，重触碰时整段重发（语义不变）", () => {
            const now = Date.now();
            emitted_record_keys.set(
                "claude_code|local|sess-idle|m-old",
                now - 31 * 24 * 60 * 60 * 1000,
            );
            // 会话 idle：不设 session_touch_ts（>30 天未触碰）。
            mock_scan_jsonls.mockReturnValue({
                sessions: [],
                daily: [],
                records: [],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            collect();
            expect(emitted_record_keys.has("claude_code|local|sess-idle|m-old")).toBe(false);
        });

        it("t386 AC-003: 同一 message_id 跨会话不误合并（key 含会话维度独立）", () => {
            mock_scan_jsonls.mockReturnValue({
                sessions: [],
                daily: [],
                records: [
                    record({
                        message_id: "dup",
                        session_id: "sa",
                        source: "claude_code",
                        env: "local",
                    }),
                    record({
                        message_id: "dup",
                        session_id: "sb",
                        source: "claude_code",
                        env: "local",
                    }),
                ],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            collect();
            // 同 message_id 不同会话 → 两个独立 key 都标记已发。
            expect(emitted_record_keys.has("claude_code|local|sa|dup")).toBe(true);
            expect(emitted_record_keys.has("claude_code|local|sb|dup")).toBe(true);
        });

        it("t393 AC-003: 边界到期 key 本轮即回收（去重判定前移，不延迟一轮重发）", () => {
            const now = Date.now();
            // 恰过窗口边界的 key（>30 天 1ms），会话不活跃（无 touch）。
            emitted_record_keys.set(
                "claude_code|local|s1|m1",
                now - EMITTED_WINDOW_MS - 1,
            );
            mock_scan_jsonls.mockReturnValue({
                sessions: [],
                daily: [],
                records: [record({ message_id: "m1" })],
                new_state: { mtimes: new Map(), files: new Map() },
            });
            configure(base_config);
            const update = mock_post_message.mock.calls[0]![0] as {
                records: AgentSessionUsage[];
            };
            // 边界到期 key 本轮即重发（旧实现：去重循环后才 prune → 本轮被跳过，
            // 延迟一轮才重发）。
            expect(update.records).toHaveLength(1);
            expect(update.records[0]!.message_id).toBe("m1");
        });

        it("skips save_state when a round has no changes (t346 AC-002)", () => {
            // 首轮有数据 → save_state（scan_save）调用。
            const cfg = { ...base_config, state_path: "/tmp/scan-state.json" };
            mock_read_costs.mockReturnValue({
                sessions: [upsert({ id: "s1" })],
                new_offset: 100,
                new_size: 100,
            });
            configure(cfg);
            expect(mock_scan_save).toHaveBeenCalled();

            // 第二轮无变化（reader 返回空）→ save_state 不调用。
            mock_read_costs.mockReturnValue({ sessions: [], new_offset: 100, new_size: 100 });
            mock_scan_save.mockClear();
            collect();
            expect(mock_scan_save).not.toHaveBeenCalled();
        });

        it("does not save on unavailable sources (t346 AC-002)", () => {
            // 所有 source 空数据 + grok 永久 unavailable（Windows 无 Grok）：
            // 无数据时 unavailable 不应触发保存（否则每轮 fsync）。
            const cfg = { ...wsl_config, state_path: "/tmp/scan-state.json" };
            mock_scan_grok.mockReturnValue({
                sessions: [],
                daily: [],
                records: [],
                new_state: { mtimes: new Map(), files: new Map() },
                missing: true,
            });
            configure(cfg);
            expect(mock_scan_save).not.toHaveBeenCalled();
        });
    });
});
