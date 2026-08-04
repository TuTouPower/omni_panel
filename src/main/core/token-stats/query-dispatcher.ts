import { utilityProcess, type UtilityProcess } from "electron";
import * as fs from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type {
    TokenStatsDashboardDto,
    TokenStatsDashboardQuery,
} from "../../../shared/types/token-stats";
import type { QueryDashboardError, QueryDashboardResult } from "./query-worker";

const log = createLogger("token-stats-query-dispatcher");

export interface TokenStatsQueryDispatcher {
    /**
     * Execute a dashboard query in the isolated read-only worker. Fast
     * successive calls coalesce: only the newest queued request runs, older
     * ones resolve with a controlled superseded error (AC4).
     */
    request_dashboard(
        query: TokenStatsDashboardQuery,
        status: { running: boolean; last_updated: number | null },
    ): Promise<TokenStatsDashboardDto>;
    is_running(): boolean;
    /** Kill the worker and reject in-flight requests (AC5 graceful shutdown). */
    stop(): void;
}

const REQUEST_TIMEOUT_MS = 10_000;
const RESTART_DELAY_MS = 1_000;

/** Test knobs: override timing so unit tests exercise timeout/recovery paths
 *  without waiting the production delays. */
export interface TokenStatsQueryDispatcherOptions {
    request_timeout_ms?: number;
    restart_delay_ms?: number;
}

export class QueryTimeoutError extends Error {
    constructor() {
        super("Token stats dashboard query timed out");
        this.name = "QueryTimeoutError";
    }
}
export class QuerySupersededError extends Error {
    constructor() {
        super("Token stats dashboard query superseded by a newer request");
        this.name = "QuerySupersededError";
    }
}

/**
 * Resolve the query worker entry built by electron-vite (out/main/query-worker.js).
 * Packaged: prefer the real file in app.asar.unpacked when present (same
 * strategy as the collector — utilityProcess forks need a real file path).
 */
function resolve_worker_path(): string {
    const candidate = join(__dirname, "query-worker.js");
    if (!process.defaultApp) {
        const unpacked = candidate.replace("app.asar", "app.asar.unpacked");
        return fs.existsSync(unpacked) ? unpacked : candidate;
    }
    return candidate;
}

interface PendingQuery {
    request_id: number;
    query: TokenStatsDashboardQuery;
    status: { running: boolean; last_updated: number | null };
    resolve: (dto: TokenStatsDashboardDto) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout> | null;
}

type WorkerOutcome = { ok: true; dto: TokenStatsDashboardDto } | { ok: false; err: Error };

export function create_token_stats_query_dispatcher(
    deps: { db_path: string },
    options: TokenStatsQueryDispatcherOptions = {},
): TokenStatsQueryDispatcher {
    const request_timeout_ms = options.request_timeout_ms ?? REQUEST_TIMEOUT_MS;
    const restart_delay_ms = options.restart_delay_ms ?? RESTART_DELAY_MS;
    let child: UtilityProcess | null = null;
    let request_seq = 0;
    let active: PendingQuery | null = null;
    let queued: PendingQuery | null = null;
    let restart_timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function spawn(): void {
        if (stopped) return;
        log.info("Starting query worker subprocess");
        child = utilityProcess.fork(resolve_worker_path(), [], {
            stdio: ["ignore", "pipe", "pipe"],
            serviceName: "token-stats-query-worker",
        });
        child.on("message", (msg: unknown) => {
            const m = msg as QueryDashboardResult | QueryDashboardError | undefined;
            if (!m) return;
            if (m.type === "query_dashboard_result") {
                settle(m.request_id, { ok: true, dto: m.dto });
            } else {
                log.warn(`Query worker reported dashboard error: ${m.message}`);
                settle(m.request_id, { ok: false, err: new Error(m.message) });
            }
        });
        // Surface the child's own log output through the main logger so
        // read-only store failures inside the worker are diagnosable.
        child.stdout?.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (line) log.info(`[query-worker] ${line}`);
        });
        child.stderr?.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (line) log.error(`[query-worker] ${line}`);
        });
        child.on("exit", (code) => {
            log.warn(`Query worker exited: code=${String(code)}`);
            child = null;
            fail_pending("Token stats query worker exited");
            if (!stopped) {
                // Controlled recovery: restart after a short delay so bursts
                // of crashes cannot spin, but a single crash self-heals (AC5).
                // Skip when a new request already spawned a fresh worker during
                // the gap, otherwise a second fork leaks the earlier child.
                restart_timer = setTimeout(() => {
                    restart_timer = null;
                    if (!stopped && !child) {
                        log.info("Restarting query worker subprocess");
                        spawn();
                    }
                }, restart_delay_ms);
                restart_timer.unref();
            }
        });
        child.postMessage({ type: "init", db_path: deps.db_path });
    }

    function settle(request_id: number, outcome: WorkerOutcome): void {
        // Stale responses (request superseded/timed out meanwhile) are dropped.
        if (active?.request_id === request_id) {
            const p = active;
            active = null;
            if (p.timer) clearTimeout(p.timer);
            if (outcome.ok) p.resolve(outcome.dto);
            else p.reject(outcome.err);
        }
        if (queued) {
            const next = queued;
            queued = null;
            active = next;
            send(next);
        }
    }

    function send(p: PendingQuery): void {
        if (!child) {
            // No child (e.g. between crash and restart) — surface controlled
            // errors for both the active and any queued request so nothing is
            // left hanging until the restart timer fires.
            if (p.timer) clearTimeout(p.timer);
            p.reject(new Error("Token stats query worker is not running"));
            active = null;
            if (queued) {
                const q = queued;
                queued = null;
                if (q.timer) clearTimeout(q.timer);
                q.reject(new Error("Token stats query worker is not running"));
            }
            return;
        }
        child.postMessage({
            type: "query_dashboard",
            request_id: p.request_id,
            query: p.query,
            status: p.status,
        });
    }

    function fail_pending(message: string): void {
        if (active) {
            const p = active;
            active = null;
            if (p.timer) clearTimeout(p.timer);
            p.reject(new Error(message));
        }
        if (queued) {
            const p = queued;
            queued = null;
            if (p.timer) clearTimeout(p.timer);
            p.reject(new Error(message));
        }
    }

    return {
        request_dashboard(query, status) {
            if (stopped) {
                return Promise.reject(new Error("Token stats query worker is stopped"));
            }
            if (!child) {
                spawn();
            }
            return new Promise<TokenStatsDashboardDto>((resolve, reject) => {
                const p: PendingQuery = {
                    request_id: ++request_seq,
                    query,
                    status,
                    resolve,
                    reject,
                    timer: null,
                };
                p.timer = setTimeout(() => {
                    if (active?.request_id === p.request_id) {
                        active = null;
                        p.reject(new QueryTimeoutError());
                        if (queued) {
                            const next = queued;
                            queued = null;
                            active = next;
                            send(next);
                        }
                    } else if (queued?.request_id === p.request_id) {
                        queued = null;
                        p.reject(new QueryTimeoutError());
                    }
                }, request_timeout_ms);
                p.timer.unref();
                if (active) {
                    // Only the newest queued request survives (AC4); an older
                    // one is rejected with a controlled superseded error.
                    if (queued) {
                        const old = queued;
                        queued = null;
                        if (old.timer) clearTimeout(old.timer);
                        old.reject(new QuerySupersededError());
                    }
                    queued = p;
                } else {
                    active = p;
                    send(p);
                }
            });
        },

        is_running() {
            return child !== null;
        },

        stop() {
            stopped = true;
            if (restart_timer) {
                clearTimeout(restart_timer);
                restart_timer = null;
            }
            fail_pending("Token stats query worker stopped");
            if (child) {
                // Offer the worker a graceful close (releases its read-only
                // connection) before killing; best-effort, kill() terminates
                // the process regardless.
                child.postMessage({ type: "close" });
                child.kill();
                child = null;
                log.info("Query worker stopped");
            }
        },
    };
}
