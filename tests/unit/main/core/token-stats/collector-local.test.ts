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
import { configure, reset_config } from "../../../../../src/main/core/token-stats/collector";
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

        mock_post_message.mockClear();
    });

    it("reads local claude jsonl from os.homedir() and posts the session", () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-collector-local-"));
        try {
            homedir_mock.dir = home;
            const projects = path.join(home, ".claude", "projects", "s1");
            fs.mkdirSync(projects, { recursive: true });
            fs.writeFileSync(path.join(projects, "s1.jsonl"), `${SESSION_JSONL}\n`, "utf-8");

            configure({ ...base_config, win_home: home });

            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0] as {
                type: string;
                sessions: { id: string; env: string; input_tokens: number }[];
                records: AgentSessionUsage[];
            };
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
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it("skips unreachable wsl sources without errors (paths resolve to null)", () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-collector-local-"));
        try {
            homedir_mock.dir = home;
            // No wsl data present anywhere; wsl_enabled=true would try to read
            // the wsl sources, but on this host their paths are null and the
            // collector must stay silent (no crash, no reads, empty update).
            configure({ ...base_config, wsl_enabled: true });

            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0] as {
                type: string;
                sessions: unknown[];
                records: unknown[];
            };
            expect(update.type).toBe("token_stats_update");
            expect(update.sessions).toEqual([]);
            expect(update.records).toEqual([]);
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    it("collect() no-ops when homedir lacks any install data", () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "ts-collector-local-"));
        try {
            homedir_mock.dir = home;
            configure(base_config);
            expect(mock_post_message).toHaveBeenCalledTimes(1);
            const update = mock_post_message.mock.calls[0]![0] as { sessions: unknown[] };
            expect(update.sessions).toEqual([]);
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});
