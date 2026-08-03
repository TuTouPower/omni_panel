import type {
    TokenStatsDashboardDto,
    TokenStatsDashboardQuery,
} from "../../../shared/types/token-stats";
import { createLogger } from "../../../shared/lib/logger";
import { create_token_stats_store } from "./token-stats-store";

const log = createLogger("token-stats-query-worker");

/**
 * Isolated dashboard query executor (t193). Runs as an Electron utilityProcess
 * child so heavy better-sqlite3 reads never block the main process event loop.
 * Opens a read-only connection to the WAL database the main-process store
 * writes concurrently; only the db path, the validated query and the status
 * snapshot are ever received — no secrets, no config, no file access (AC7).
 *
 * Protocol (parentPort):
 *   parent → child:  { type: "init", db_path }
 *                    { type: "query_dashboard", request_id, query, status }
 *   child → parent:  { type: "query_dashboard_result", request_id, dto }
 *                     { type: "query_dashboard_error", request_id, message }
 */

export interface QueryWorkerInit {
    type: "init";
    db_path: string;
}
export interface QueryWorkerClose {
    type: "close";
}
export interface QueryDashboardRequest {
    type: "query_dashboard";
    request_id: number;
    query: TokenStatsDashboardQuery;
    status: { running: boolean; last_updated: number | null };
}
export interface QueryDashboardResult {
    type: "query_dashboard_result";
    request_id: number;
    dto: TokenStatsDashboardDto;
}
export interface QueryDashboardError {
    type: "query_dashboard_error";
    request_id: number;
    message: string;
}
export type QueryWorkerInbound = QueryWorkerInit | QueryWorkerClose | QueryDashboardRequest;
export type QueryWorkerOutbound = QueryDashboardResult | QueryDashboardError;

interface ParentPortLike {
    postMessage(message: unknown): void;
    on(event: "message", listener: (e: { data: unknown }) => void): void;
}

function get_parent_port(): ParentPortLike | undefined {
    return (process as unknown as { parentPort?: ParentPortLike }).parentPort;
}

export function run_query_worker(): void {
    const port = get_parent_port();
    if (!port) {
        log.warn("Query worker started without a parent port; nothing to do");
        return;
    }
    let db_path: string | null = null;
    // Lazily open the read-only store on the first request so a worker spawned
    // before the DB exists (or after it was moved) surfaces the failure as a
    // per-request error instead of a startup crash.
    let store: ReturnType<typeof create_token_stats_store> | null = null;
    const ensure_store = (): ReturnType<typeof create_token_stats_store> => {
        if (!store) {
            if (!db_path) {
                throw new Error("Query worker received a query before init");
            }
            store = create_token_stats_store(db_path, { readonly: true });
        }
        return store;
    };

    port.on("message", (e: { data: unknown }) => {
        const msg = e.data as QueryWorkerInbound;
        switch (msg.type) {
            case "init":
                db_path = msg.db_path;
                return;
            case "close":
                // Release the read-only connection (used by tests and graceful
                // shutdown); the next query reopens it.
                store?.close();
                store = null;
                return;
            case "query_dashboard": {
                try {
                    const dto = ensure_store().query_dashboard(msg.query, msg.status);
                    const out: QueryDashboardResult = {
                        type: "query_dashboard_result",
                        request_id: msg.request_id,
                        dto,
                    };
                    port.postMessage(out);
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    const out: QueryDashboardError = {
                        type: "query_dashboard_error",
                        request_id: msg.request_id,
                        message,
                    };
                    port.postMessage(out);
                }
                return;
            }
            default:
                return;
        }
    });
}

// Entry point for the utilityProcess child: start listening immediately when
// forked. Importing this module in tests (no parent port) is a no-op, mirroring
// the collector's parentPort pattern.
if (get_parent_port()) {
    run_query_worker();
}
