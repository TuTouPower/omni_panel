/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// t308 AC-001 integration (t437 语义延续): on a non-Windows host the
// `linux` platform sources must resolve under os.homedir() and actually read
// the user's install data. The homedir is redirected to a temp dir (no real
// ~/.claude touched) and the real claude-reader parses a fixture jsonl — no
// reader mocks.
const homedir_mock = vi.hoisted(() => ({ dir: "" }));
vi.mock(import("node:os"), async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, homedir: () => homedir_mock.dir };
});

const mock_post_message = vi.fn();
(process as unknown as Record<string, unknown>)["parentPort"] = {
    postMessage: mock_post_message,
    on: vi.fn(),
};

// Import after mocks
import {
    configure,
    reset_config,
    set_collector_host,
    set_win_home_wsl_probe,
} from "../../../../../src/main/core/token-stats/collector";
import { host_from_platform } from "../../../../../src/main/core/token-stats/paths";
import type {
    AgentSessionUsage,
    TokenStatsConfig,
} from "../../../../../src/shared/types/token-stats";

const base_config: TokenStatsConfig = {
    win_home: "/unused-on-linux",
    wsl_enabled: false,
    wsl_distro: "Ubuntu-22.04",
    wsl_user: "",
    poll_interval_ms: 600000,
    state_path: "",
};

const SESSION_JSONL = JSON.stringify({
    type: "assistant",
    message: {
        model: "claude-sonnet-4-20250514",
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 },
    },
    timestamp: "2026-07-10T08:00:00.000Z",
    sessionId: "s1",
    cwd: "/proj",
});

describe("collector on a non-Windows host (t308 AC-001)", () => {
    beforeEach(() => {
        // t438: 默认禁用真实 Windows home 发现（防单测触发 powershell.exe/真实
        // /mnt/c）；需要 win 源的测试自行注入 probe。
        set_win_home_wsl_probe(() => null);
    });

    afterEach(() => {
        reset_config();
        // t309_code_f002/f002-test: set_collector_host 不随 reset_config 复位，
        // afterEach 用生产推导 host_from_platform 恢复，避免文件内测试顺序依赖。
        set_collector_host(host_from_platform(process.platform));
        set_win_home_wsl_probe(null);

        mock_post_message.mockClear();
    });

    // t309 note: the old "reads local claude jsonl and posts the session" test
    // asserted total silence for the missing costs.jsonl (1 postMessage). AC-003
    // replaces that ENOENT silence with a per-source warn + failed status, so
    // the silence expectation is superseded — the session-posting core is kept
    // below with the new source-status semantics. t437: linux host → env=linux.
    it("t309: posts local claude jsonl sessions and reports the missing costs source failed", () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-collector-local-"));
        try {
            homedir_mock.dir = home;
            const projects = path.join(home, ".claude", "projects", "s1");
            fs.mkdirSync(projects, { recursive: true });
            fs.writeFileSync(path.join(projects, "s1.jsonl"), `${SESSION_JSONL}\n`, "utf-8");

            configure({ ...base_config, win_home: home });

            const update = mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "token_stats_update")
                .map(
                    (c) =>
                        c[0] as {
                            type: string;
                            sessions: { id: string; env: string; input_tokens: number }[];
                            records: AgentSessionUsage[];
                            sources_status: {
                                source: string;
                                env: string;
                                status: string;
                                lastError?: string;
                            }[];
                        },
                )[0]!;
            expect(update.type).toBe("token_stats_update");
            expect(update.sessions).toHaveLength(1);
            expect(update.sessions[0]).toMatchObject({
                id: "s1",
                env: "linux",
                directory: "/proj",
                // non-candidate model: cache-read normalization keeps raw input
                input_tokens: 100,
            });
            expect(update.records).toHaveLength(1);
            expect(update.records[0]).toMatchObject({
                env: "linux",
                session_id: "s1",
                agent: "claude-code",
            });
            // costs.jsonl is absent on this fresh home → the real reader throws
            // ENOENT → the source is reported failed with the error (AC-002/003).
            const costs = update.sources_status.find(
                (s) => s.source === "claude_code" && s.env === "linux",
            );
            expect(costs?.status).toBe("failed");
            expect(costs?.lastError).toContain("ENOENT");
            const warns = mock_post_message.mock.calls.filter(
                (c) => (c[0] as { type?: string }).type === "collector_log",
            );
            expect(
                warns.some(
                    (c) =>
                        (c[0] as { level: string; message: string }).level === "warn" &&
                        (c[0] as { message: string }).message.includes("claude_costs_linux") &&
                        (c[0] as { message: string }).message.includes("ENOENT"),
                ),
            ).toBe(true);
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it("t309: marks unreachable wsl sources unavailable on a non-Windows host", () => {
        // t309_code_f001: 显式注入 host，避免 CI 矩阵 Windows job 上
        // process.platform 推导为 windows 导致 host 过滤分支不执行而挂。
        set_collector_host("linux");
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-collector-local-"));
        try {
            homedir_mock.dir = home;
            // No wsl data present anywhere; on this host the wsl sources are
            // host-filtered (declarative hosts list), never read, and reported
            // unavailable with a reason instead of failing silently.
            configure({ ...base_config, wsl_enabled: true });

            const update = mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "token_stats_update")
                .map(
                    (c) =>
                        c[0] as {
                            type: string;
                            sessions: unknown[];
                            records: unknown[];
                            sources_status: {
                                source: string;
                                env: string;
                                status: string;
                                lastError?: string;
                            }[];
                        },
                )[0]!;
            expect(update.type).toBe("token_stats_update");
            expect(update.sessions).toEqual([]);
            expect(update.records).toEqual([]);
            const wsl_statuses = update.sources_status.filter((s) => s.env === "wsl");
            expect(wsl_statuses).toHaveLength(5);
            expect(wsl_statuses.every((s) => s.status === "unavailable")).toBe(true);
            // AC-003: each host-filtered wsl source emits a warn log carrying the
            // reason (the missing costs.jsonl also warns — filter to wsl ones).
            const wsl_warns = mock_post_message.mock.calls.filter(
                (c) =>
                    (c[0] as { type?: string }).type === "collector_log" &&
                    (c[0] as { message: string }).message.includes(
                        "unavailable: wsl data requires a windows host",
                    ),
            );
            expect(wsl_warns).toHaveLength(5);
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    // t309 note: the old "collect() no-ops when homedir lacks any install data"
    // test expected a single silent message; the empty-update core is kept below
    // with the new source-status semantics (missing data → failed status + warn).
    it("t309: an empty home collects without crashing and reports the missing source failed", () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-collector-local-"));
        try {
            homedir_mock.dir = home;
            configure(base_config);
            const update = mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "token_stats_update")
                .map(
                    (c) =>
                        c[0] as {
                            sessions: unknown[];
                            records: unknown[];
                            sources_status: {
                                source: string;
                                env: string;
                                status: string;
                                lastError?: string;
                            }[];
                        },
                )[0]!;
            expect(update.sessions).toEqual([]);
            expect(update.records).toEqual([]);
            const costs = update.sources_status.find(
                (s) => s.source === "claude_code" && s.env === "linux",
            );
            expect(costs?.status).toBe("failed");
            expect(costs?.lastError).toContain("ENOENT");
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    // --- t438: linux 宿主自动发现 Windows home，采 env=win（真实 reader） ---

    const T_TS = 1784217963000;

    /** 构造 kimi wire.jsonl：首条 user 消息定 title（AC-002 搜标题），
     *  后随 usage.record 提供 token/时间。 */
    function kimi_wire(first_user_text: string, extra_lines: string[] = []): string {
        const lines = [
            JSON.stringify({
                type: "context.append_message",
                message: {
                    role: "user",
                    content: [{ type: "text", text: first_user_text }],
                    origin: { kind: "user" },
                },
                time: T_TS,
            }),
            JSON.stringify({
                type: "usage.record",
                model: "kimi-code/k3",
                usage: {
                    inputOther: 100,
                    output: 50,
                    inputCacheRead: 10,
                    inputCacheCreation: 5,
                },
                usageScope: "turn",
                time: T_TS + 778,
            }),
            ...extra_lines,
        ];
        return `${lines.join("\n")}\n`;
    }

    /** 在 home 下造 kimi 假会话（.kimi-code/sessions/<wd>/session_<id>/agents/main/wire.jsonl
     *  + session_index.jsonl），返回 session_id。 */
    function plant_kimi_session(
        home: string,
        session_id: string,
        first_user_text: string,
        work_dir: string,
    ): void {
        const sess_dir = path.join(
            home,
            ".kimi-code",
            "sessions",
            "wd1",
            session_id,
            "agents",
            "main",
        );
        fs.mkdirSync(sess_dir, { recursive: true });
        fs.writeFileSync(path.join(sess_dir, "wire.jsonl"), kimi_wire(first_user_text), "utf-8");
        fs.writeFileSync(
            path.join(home, ".kimi-code", "session_index.jsonl"),
            `${JSON.stringify({ sessionId: session_id, workDir: work_dir })}\n`,
            "utf-8",
        );
    }

    it("t438 AC-001/AC-002: host=linux + Windows home 可发现 → kimi env=win 会话被采集，title 含关键词", () => {
        set_collector_host("linux");
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-win-home-"));
        try {
            homedir_mock.dir = path.join(home, "linux-home");
            fs.mkdirSync(homedir_mock.dir, { recursive: true });
            // 发现出的 Windows home 指向临时目录（注入 probe，不碰真实 /mnt/c）。
            const win_home = path.join(home, "win-users", "TestUser");
            plant_kimi_session(
                win_home,
                "session_k_win",
                "黑沙皇 帮我整理需求",
                "D:\\Dev\\Code\\winproj",
            );
            set_win_home_wsl_probe(() => win_home);

            configure({ ...base_config, win_home: "/unused-on-linux" });

            const update = mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "token_stats_update")
                .map(
                    (c) =>
                        c[0] as {
                            sessions: {
                                id: string;
                                env: string;
                                source: string;
                                title: string | null;
                                directory: string | null;
                            }[];
                            records: unknown[];
                            sources_status: {
                                source: string;
                                env: string;
                                status: string;
                            }[];
                        },
                )[0]!;
            // AC-001: source=kimi_code、env=win、id=fixture session。
            const kimi_win = update.sessions.find(
                (s) => s.source === "kimi_code" && s.env === "win",
            );
            expect(kimi_win).toBeDefined();
            expect(kimi_win?.id).toBe("session_k_win");
            // AC-002 前提：title 含「黑沙皇」（store 搜标题命中由 store 测试覆盖）。
            expect(kimi_win?.title).toContain("黑沙皇");
            expect(update.sources_status).toContainEqual({
                source: "kimi_code",
                env: "win",
                status: "ok",
            });
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it("t438 AC-004: linux 与 win 两处 kimi 会话同 id 并存（store 主键 (id,source,env) 区分）", () => {
        set_collector_host("linux");
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-win-home-"));
        try {
            const linux_home = path.join(home, "linux-home");
            homedir_mock.dir = linux_home;
            fs.mkdirSync(linux_home, { recursive: true });
            const win_home = path.join(home, "win-users", "TestUser");
            // 同一 session id 两处各一份：env=linux 与 env=win 互不覆盖。
            plant_kimi_session(
                linux_home,
                "session_shared",
                "黑沙皇 wsl 侧需求",
                "/home/testuser/proj",
            );
            plant_kimi_session(
                win_home,
                "session_shared",
                "黑沙皇 窗口侧需求",
                "D:\\Dev\\Code\\winproj",
            );
            set_win_home_wsl_probe(() => win_home);

            configure({ ...base_config, win_home: "/unused-on-linux" });

            const update = mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "token_stats_update")
                .map(
                    (c) =>
                        c[0] as {
                            sessions: {
                                id: string;
                                env: string;
                                source: string;
                                title: string | null;
                            }[];
                            records: unknown[];
                        },
                )[0]!;
            const kimi_sessions = update.sessions.filter((s) => s.source === "kimi_code");
            // 两 env 各一条、同 id。
            expect(kimi_sessions).toHaveLength(2);
            const win_s = kimi_sessions.find((s) => s.env === "win");
            const linux_s = kimi_sessions.find((s) => s.env === "linux");
            expect(win_s?.id).toBe("session_shared");
            expect(linux_s?.id).toBe("session_shared");
            expect(win_s?.title).toContain("窗口侧");
            expect(linux_s?.title).toContain("wsl 侧");
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it("t438 AC-005: 发现失败 → win 源 unavailable、linux kimi 照常采集（真实 reader）", () => {
        set_collector_host("linux");
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-win-home-"));
        try {
            homedir_mock.dir = path.join(home, "linux-home");
            fs.mkdirSync(homedir_mock.dir, { recursive: true });
            plant_kimi_session(
                homedir_mock.dir,
                "session_linux",
                "黑沙皇 linux 侧",
                "/home/testuser/proj",
            );
            // probe 保持 beforeEach 的 null（发现失败）——win 源不可用。

            configure({ ...base_config, win_home: "/unused-on-linux" });

            const update = mock_post_message.mock.calls
                .filter((c) => (c[0] as { type?: string }).type === "token_stats_update")
                .map(
                    (c) =>
                        c[0] as {
                            sessions: {
                                id: string;
                                env: string;
                                source: string;
                            }[];
                            sources_status: {
                                source: string;
                                env: string;
                                status: string;
                                lastError?: string;
                            }[];
                        },
                )[0]!;
            // 五个 win 源全部 unavailable（path unavailable），不崩溃。
            const win_statuses = update.sources_status.filter((s) => s.env === "win");
            expect(win_statuses).toHaveLength(5);
            expect(win_statuses.every((s) => s.status === "unavailable")).toBe(true);
            expect(win_statuses.every((s) => s.lastError === "path unavailable")).toBe(true);
            // linux 平台源不受影响：env=linux kimi 会话照常投递。
            expect(
                update.sessions.some(
                    (s) =>
                        s.source === "kimi_code" && s.env === "linux" && s.id === "session_linux",
                ),
            ).toBe(true);
            expect(update.sources_status).toContainEqual({
                source: "kimi_code",
                env: "linux",
                status: "ok",
            });
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});
