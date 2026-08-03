/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { TokenStatsDashboardDto } from "../../../../../src/shared/types/token-stats";
import {
    create_token_stats_query_dispatcher,
    QueryTimeoutError,
    QuerySupersededError,
} from "../../../../../src/main/core/token-stats/query-dispatcher";

class MockUtilityProcess extends EventEmitter {
    postMessage = vi.fn();
    kill = vi.fn();
    stdout = new EventEmitter();
    stderr = new EventEmitter();
}

let last_child: MockUtilityProcess | null = null;
const mock_fork = vi.fn<(path: string, args?: string[], options?: unknown) => MockUtilityProcess>(
    () => {
        last_child = new MockUtilityProcess();
        return last_child;
    },
);

vi.mock("electron", () => ({
    utilityProcess: {
        fork: (path: string, args?: string[], options?: unknown) => mock_fork(path, args, options),
    },
}));

const query = {
    agent: "all",
    platform: "all",
    start: 0,
    end: 1_000,
    metric: "tokens",
    xaxis: "time",
    gran: "hour",
} as const;
const status = { running: false, last_updated: null };
const fake_dto = { ok: true } as unknown as TokenStatsDashboardDto;

function sent_messages(child: MockUtilityProcess): unknown[] {
    return child.postMessage.mock.calls.map((call) => {
        const [first] = call as unknown as [unknown];
        return first;
    });
}

describe("token-stats query dispatcher (t193)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        last_child = null;
    });

    it("forks the worker, sends init + query, and resolves on result", async () => {
        const dispatcher = create_token_stats_query_dispatcher({ db_path: ":memory:" });
        const promise = dispatcher.request_dashboard(query, status);

        const child = last_child!;
        expect(mock_fork).toHaveBeenCalledTimes(1);
        expect(sent_messages(child)[0]).toEqual({ type: "init", db_path: ":memory:" });
        const sent = sent_messages(child)[1] as Record<string, unknown>;
        expect(sent["type"]).toBe("query_dashboard");
        expect(sent["request_id"]).toBe(1);
        expect(sent["query"]).toEqual(query);
        expect(sent["status"]).toEqual(status);

        child.emit("message", { type: "query_dashboard_result", request_id: 1, dto: fake_dto });
        await expect(promise).resolves.toBe(fake_dto);
        dispatcher.stop();
    });

    it("keeps only the newest queued request and supersedes an older one (AC4)", async () => {
        const dispatcher = create_token_stats_query_dispatcher({ db_path: ":memory:" });
        const p1 = dispatcher.request_dashboard(query, status);
        const child = last_child!;
        const p2 = dispatcher.request_dashboard({ ...query, start: 1 }, status);
        const p3 = dispatcher.request_dashboard({ ...query, start: 2 }, status);

        // p2 (queued) is superseded by p3 with a controlled error.
        await expect(p2).rejects.toBeInstanceOf(QuerySupersededError);

        // p3 runs once p1 completes.
        child.emit("message", { type: "query_dashboard_result", request_id: 1, dto: fake_dto });
        await expect(p1).resolves.toBe(fake_dto);
        const third = sent_messages(child)[2] as Record<string, unknown>;
        expect(third["type"]).toBe("query_dashboard");
        expect(third["request_id"]).toBe(3);
        child.emit("message", { type: "query_dashboard_result", request_id: 3, dto: fake_dto });
        await expect(p3).resolves.toBe(fake_dto);
        dispatcher.stop();
    });

    it("rejects with a controlled timeout when the worker never responds (AC3)", async () => {
        const dispatcher = create_token_stats_query_dispatcher(
            { db_path: ":memory:" },
            { request_timeout_ms: 20 },
        );
        const promise = dispatcher.request_dashboard(query, status);
        await expect(promise).rejects.toBeInstanceOf(QueryTimeoutError);
        dispatcher.stop();
    });

    it("drops a stale response whose request_id no longer matches the active request (AC3)", async () => {
        const dispatcher = create_token_stats_query_dispatcher(
            { db_path: ":memory:" },
            { request_timeout_ms: 20 },
        );
        const p1 = dispatcher.request_dashboard(query, status);
        const child = last_child!;
        await expect(p1).rejects.toBeInstanceOf(QueryTimeoutError);

        // A late result for the already-timed-out request must neither resolve
        // anything nor poison the next request.
        child.emit("message", { type: "query_dashboard_result", request_id: 1, dto: fake_dto });

        const p2 = dispatcher.request_dashboard(query, status);
        const sent = sent_messages(child)
            .filter((m) => (m as { type?: string }).type === "query_dashboard")
            .pop() as { request_id?: number };
        child.emit("message", {
            type: "query_dashboard_result",
            request_id: sent.request_id,
            dto: fake_dto,
        });
        await expect(p2).resolves.toBe(fake_dto);
        dispatcher.stop();
    });

    it("fails in-flight requests and controlled-restarts after a worker exit (AC5)", async () => {
        const dispatcher = create_token_stats_query_dispatcher(
            { db_path: ":memory:" },
            { restart_delay_ms: 10 },
        );
        const p1 = dispatcher.request_dashboard(query, status);
        const first_child = last_child!;
        expect(dispatcher.is_running()).toBe(true);

        first_child.emit("exit", 1);
        await expect(p1).rejects.toThrow(/exited/);

        // Restart timer (10ms) spawns a fresh worker.
        const until = Date.now() + 500;
        while (last_child === first_child && Date.now() < until) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(last_child).not.toBe(first_child);
        expect(dispatcher.is_running()).toBe(true);
        expect(sent_messages(last_child!)[0]).toEqual({ type: "init", db_path: ":memory:" });
        dispatcher.stop();
    });

    it("does not double-fork when a request arrives during the restart gap (AC5)", async () => {
        const dispatcher = create_token_stats_query_dispatcher(
            { db_path: ":memory:" },
            { restart_delay_ms: 100 },
        );
        const p1 = dispatcher.request_dashboard(query, status);
        const first_child = last_child!;
        first_child.emit("exit", 1);
        await expect(p1).rejects.toThrow(/exited/);

        // A new request during the restart gap spawns a fresh worker right away.
        const p2 = dispatcher.request_dashboard(query, status);
        const second_child = last_child!;
        expect(second_child).not.toBe(first_child);
        expect(mock_fork).toHaveBeenCalledTimes(2);

        // The pending restart timer must not spawn a second child over the
        // worker the new request already created.
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(mock_fork).toHaveBeenCalledTimes(2);

        const sent = sent_messages(second_child)
            .filter((m) => (m as { type?: string }).type === "query_dashboard")
            .pop() as { request_id?: number };
        second_child.emit("message", {
            type: "query_dashboard_result",
            request_id: sent.request_id,
            dto: fake_dto,
        });
        await expect(p2).resolves.toBe(fake_dto);
        dispatcher.stop();
    });

    it("stop() rejects in-flight and future requests and kills the worker (AC5)", async () => {
        const dispatcher = create_token_stats_query_dispatcher({ db_path: ":memory:" });
        const p = dispatcher.request_dashboard(query, status);
        const child = last_child!;
        dispatcher.stop();
        await expect(p).rejects.toThrow(/stopped|exited/);
        await expect(dispatcher.request_dashboard(query, status)).rejects.toThrow(/stopped/);
        expect(child.kill).toHaveBeenCalled();
        // Graceful close is offered before the kill so the worker's read-only
        // connection is released (code f002: close protocol must stay reachable).
        expect(child.postMessage).toHaveBeenCalledWith({ type: "close" });
        expect(dispatcher.is_running()).toBe(false);
    });
});
