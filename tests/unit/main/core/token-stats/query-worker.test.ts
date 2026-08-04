import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { create_token_stats_store } from "../../../../../src/main/core/token-stats/token-stats-store";
import { run_query_worker } from "../../../../../src/main/core/token-stats/query-worker";
import type { QueryWorkerOutbound } from "../../../../../src/main/core/token-stats/query-worker";
import type { TokenStatsDashboardQuery } from "../../../../../src/shared/types/token-stats";

const T0 = new Date("2026-07-10T08:00:00Z").getTime();

function record(
    overrides: Partial<
        Parameters<ReturnType<typeof create_token_stats_store>["upsert_records"]>[0][number]
    > = {},
) {
    return {
        session_id: "s1",
        title: "hello",
        directory: "/proj",
        slug: "slug",
        version: "1.0.0",
        parent_session_id: null,
        message_id: "msg-001",
        role: "assistant",
        timestamp: T0,
        model: "sonnet-4",
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 10,
        cache_write_tokens: 5,
        agent: "claude-code",
        source: "claude_code",
        env: "win",
        ...overrides,
    } as const;
}

const query: TokenStatsDashboardQuery = {
    agent: "all",
    platform: "all",
    start: T0,
    end: T0 + 3600000,
    metric: "tokens",
    xaxis: "time",
    gran: "hour",
};
const status = { running: false, last_updated: null };

type MessageListener = (e: { data: unknown }) => void;

function run_worker_with_port(): {
    postMessage: ReturnType<typeof vi.fn>;
    emit: (data: unknown) => void;
    db_path: string;
} {
    const listeners = new Set<MessageListener>();
    const postMessage = vi.fn();
    const port = {
        postMessage,
        on: (_event: string, cb: MessageListener) => {
            listeners.add(cb);
        },
    };
    (process as unknown as { parentPort?: unknown }).parentPort = port;
    run_query_worker();
    return {
        postMessage,
        emit: (data: unknown) => {
            listeners.forEach((cb) => {
                cb({ data });
            });
        },
        db_path: "",
    };
}

describe("token-stats query worker (t193)", () => {
    beforeEach(() => {
        delete (process as unknown as { parentPort?: unknown }).parentPort;
    });

    it("opens a read-only store and returns a dashboard DTO matching the writable store", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-worker-"));
        try {
            const db_path = path.join(dir, "usage.sqlite");
            const writable = create_token_stats_store(db_path);
            writable.upsert_records([record({ message_id: "m1" })]);
            writable.backfill_hour_rollup();

            const worker = run_worker_with_port();
            worker.emit({ type: "init", db_path });
            worker.emit({
                type: "query_dashboard",
                request_id: 1,
                query,
                status,
            });

            const [out] = worker.postMessage.mock.calls[0] as [QueryWorkerOutbound];
            expect(out.type).toBe("query_dashboard_result");
            const dto = (
                out as {
                    dto: ReturnType<ReturnType<typeof create_token_stats_store>["query_dashboard"]>;
                }
            ).dto;
            expect(dto.data_version).toBe(1);
            expect(dto.sessions.total).toBe(1);
            expect(dto.current.calls).toBe(1);

            worker.emit({ type: "close" });
            writable.close();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("reports a controlled error when queried before init (AC3)", () => {
        const worker = run_worker_with_port();
        worker.emit({ type: "query_dashboard", request_id: 7, query, status });
        const [out] = worker.postMessage.mock.calls[0] as [QueryWorkerOutbound];
        expect(out.type).toBe("query_dashboard_error");
        expect((out as { message: string }).message).toMatch(/before init/i);
    });

    it("reports a controlled error when the read-only DB cannot be opened (AC3)", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-worker-missing-"));
        try {
            const missing_path = path.join(dir, "does-not-exist.sqlite");
            const worker = run_worker_with_port();
            worker.emit({ type: "init", db_path: missing_path });
            worker.emit({ type: "query_dashboard", request_id: 2, query, status });
            const [out] = worker.postMessage.mock.calls[0] as [QueryWorkerOutbound];
            expect(out.type).toBe("query_dashboard_error");
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("ignores non-dashboard messages", () => {
        const worker = run_worker_with_port();
        worker.emit({ type: "other", request_id: 1 });
        expect(worker.postMessage).not.toHaveBeenCalled();
    });
});
