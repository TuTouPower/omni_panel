/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";

// t308 AC-001 integration: on a non-Windows host the `local` sources must
// resolve under os.homedir() and actually read the user's install data. The
// homedir is redirected to a temp dir (no real ~/.claude touched) and the
// real claude-reader parses a fixture jsonl — no reader mocks.
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
    afterEach(() => {
        reset_config();
        // t309_code_f002/f002-test: set_collector_host 不随 reset_config 复位，
        // afterEach 用生产推导 host_from_platform 恢复，避免文件内测试顺序依赖。
        set_collector_host(host_from_platform(process.platform));

        mock_post_message.mockClear();
    });

    // t309 note: the old "reads local claude jsonl and posts the session" test
    // asserted total silence for the missing costs.jsonl (1 postMessage). AC-003
    // replaces that ENOENT silence with a per-source warn + failed status, so
    // the silence expectation is superseded — the session-posting core is kept
    // below with the new source-status semantics.
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
                env: "local",
                directory: "/proj",
                // non-candidate model: cache-read normalization keeps raw input
                input_tokens: 100,
            });
            expect(update.records).toHaveLength(1);
            expect(update.records[0]).toMatchObject({
                env: "local",
                session_id: "s1",
                agent: "claude-code",
            });
            // costs.jsonl is absent on this fresh home → the real reader throws
            // ENOENT → the source is reported failed with the error (AC-002/003).
            const costs = update.sources_status.find(
                (s) => s.source === "claude_code" && s.env === "local",
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
                        (c[0] as { message: string }).message.includes("claude_costs_local") &&
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
                (s) => s.source === "claude_code" && s.env === "local",
            );
            expect(costs?.status).toBe("failed");
            expect(costs?.lastError).toContain("ENOENT");
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});
