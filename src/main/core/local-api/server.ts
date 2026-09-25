import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { is_test_build } from "../paths";
import { createLogger } from "../../../shared/lib/logger";
import type { ObservationStore } from "../observation/observation-store";
import type { Observation } from "../../../shared/types/observation";
import { observation_ingest_schema as observationSchema } from "../../../shared/schemas/observation";
import type { TokenStatsStore } from "../token-stats/token-stats-store";
import type { TokenStatsQueryDispatcher } from "../token-stats/query-dispatcher";
import type { ConfigIpcDeps } from "../../ipc/config-ipc";
import type { ConnectorIpcDeps } from "../../ipc/connector-ipc";
import { state_to_snapshot_dto } from "../../ipc/helpers";
import type { ConnectorSnapshotState } from "../scheduler/types";
import type { AppConfiguration } from "../../../shared/types/config";
import {
    json_response,
    read_json_body,
    parse_body,
    parse_int_param,
    safe_json_reviver,
    is_within_web_root,
    RequestBodyTooLargeError,
} from "./http_helpers";
import { handle_web_trend } from "./routes/trend";
import { handle_web_auth, type AuthDeps } from "./routes/auth";
import { handle_logs_export, handle_renderer_log } from "./routes/logs";
import { handle_web_config } from "./routes/config";
import { handle_web_connector } from "./routes/connector";
import { handle_web_control, type ControlDeps, type ControlState } from "./routes/control";
import { handle_web_dev_panel, type DevPanelDeps } from "./routes/dev_panel";
import {
    handle_web_session_history,
    sse_cleanup_should_unsubscribe,
    type SessionHistoryDeps,
    type WebSessionSub,
} from "./routes/session_history";
import { handle_web_read } from "./routes/token_stats";

export {
    parse_int_param,
    safe_json_reviver,
    is_within_web_root,
    sse_cleanup_should_unsubscribe,
    type ControlState,
    type ControlDeps,
    type DevPanelDeps,
    type AuthDeps,
    type SessionHistoryDeps,
};

export const DEFAULT_PORT = 17863;
export const TEST_DEFAULT_PORT = 17864;

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2",
};

export interface LocalAPIServer {
    start(): Promise<{ port: number; token: string }>;
    stop(): Promise<void>;
    get_port(): number;
    get_token(): string;
    publish_config_change(config: AppConfiguration): void;
    publish_theme_change(is_dark: boolean): void;
    publish_control_state(state: ControlState): void;
    broadcast_state?(payload: unknown): void;
    connected_clients?(): number;
}

function generate_token(): string {
    return randomBytes(32).toString("hex");
}

function check_auth(req: IncomingMessage, token: string): boolean {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return false;
    const actual = Buffer.from(auth.slice(7), "utf8");
    const expected = Buffer.from(token, "utf8");
    return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function serve_static(url: URL, res: ServerResponse, web_root: string): void {
    let requested: string;
    try {
        requested = decodeURIComponent(url.pathname);
    } catch {
        json_response(res, 400, { error: "Invalid URL encoding" });
        return;
    }
    const resolved = path.resolve(web_root, requested.replace(/^[/\\]+/, ""));
    if (!is_within_web_root(web_root, resolved)) {
        json_response(res, 403, { error: "Forbidden" });
        return;
    }
    fs.stat(resolved, (stat_err, stat) => {
        const file_path = stat_err || !stat.isFile() ? path.join(web_root, "index.html") : resolved;
        fs.readFile(file_path, (err, data) => {
            if (err) {
                json_response(res, 404, { error: "Not found" });
                return;
            }
            const content_type = MIME[path.extname(file_path)] ?? "application/octet-stream";
            const headers: Record<string, string> = {
                "Content-Type": content_type,
                "X-Content-Type-Options": "nosniff",
            };
            if (file_path.endsWith(".html")) {
                headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
                headers["Content-Security-Policy"] =
                    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
                    "frame-ancestors 'none'; base-uri 'self'";
            } else {
                headers["Cache-Control"] = "public, max-age=31536000, immutable";
            }
            res.writeHead(200, headers);
            res.end(data);
        });
    });
}

export function create_local_api_server(
    observation_store: ObservationStore,
    options?: {
        port?: number;
        token_stats_store?: TokenStatsStore;
        token_stats_running?: () => boolean;
        token_stats_force_collect?: () => void;
        theme_set?: (mode: "light" | "dark" | "system") => void;
        token_stats_query_dispatcher?: TokenStatsQueryDispatcher;
        config_deps?: ConfigIpcDeps;
        connector_deps?: ConnectorIpcDeps;
        session_history_deps?: SessionHistoryDeps;
        control_deps?: ControlDeps;
        dev_panel_deps?: DevPanelDeps;
        auth_deps?: AuthDeps;
        web_root?: string;
        user_data_path?: string;
    },
): LocalAPIServer {
    const log = createLogger("local-api");
    const token = generate_token();
    const token_stats_store = options?.token_stats_store;
    const token_stats_running = options?.token_stats_running ?? (() => true);
    const token_stats_force_collect = options?.token_stats_force_collect;
    const theme_set = options?.theme_set;
    const token_stats_query_dispatcher = options?.token_stats_query_dispatcher;
    const config_deps = options?.config_deps;
    const connector_deps = options?.connector_deps;
    const session_history_deps = options?.session_history_deps;
    const control_deps = options?.control_deps;
    const dev_panel_deps = options?.dev_panel_deps;
    const auth_deps = options?.auth_deps;
    const web_root = options?.web_root;
    const user_data_path = options?.user_data_path;
    const env_port = Number(process.env["OMNI_PANEL_PORT"] ?? "");
    const default_port = is_test_build() ? TEST_DEFAULT_PORT : DEFAULT_PORT;
    let port =
        options?.port ?? (Number.isFinite(env_port) && env_port > 0 ? env_port : default_port);
    let server: ReturnType<typeof createServer> | null = null;
    const sse_clients = new Set<ServerResponse>();
    const web_session_subs = new Map<string, WebSessionSub>();
    const sse_client_sub_ids = new Map<string, ServerResponse>();
    const sse_connections = new Map<string, ServerResponse>();

    async function handle_ingest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        let parsed: unknown;
        try {
            parsed = JSON.parse((await parse_body(req)).toString("utf8"));
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) {
                json_response(res, 413, { error: "Request body too large" });
                return;
            }
            json_response(res, 400, { error: "Invalid JSON" });
            return;
        }
        const result = observationSchema.safeParse(parsed);
        if (!result.success) {
            json_response(res, 400, { error: "Invalid observation payload" });
            return;
        }
        const observation: Observation = {
            ...(result.data as unknown as Observation),
            observed_at: Date.now(),
            stale: false,
            last_error: null,
        };
        observation_store.insert(observation);
        json_response(res, 200, { status: "ok" });
    }

    function write_sse_event(res: ServerResponse, event: string | undefined, data: unknown): void {
        if (res.destroyed || res.writableEnded) return;
        const event_line = event ? `event: ${event}\n` : "";
        res.write(`${event_line}data: ${JSON.stringify(data)}\n\n`);
    }

    function handle_sse(req: IncomingMessage, res: ServerResponse): void {
        const store = connector_deps?.runtimeStore;
        if (!store) {
            json_response(res, 503, { error: "events unavailable" });
            return;
        }
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        res.flushHeaders();
        sse_clients.add(res);

        const sse_url = new URL(req.url ?? "/", "http://local");
        const subscriber_id = sse_url.searchParams.get("subscriberId");
        const connection_id = sse_url.searchParams.get("connectionId");
        if (subscriber_id) {
            sse_client_sub_ids.set(subscriber_id, res);
        }
        if (connection_id) {
            sse_connections.set(connection_id, res);
        }

        const unsub = store.subscribe({
            onStateChange(instanceId: string, state: ConnectorSnapshotState): void {
                write_sse_event(res, undefined, {
                    instanceId,
                    state: state_to_snapshot_dto(state),
                });
            },
        });

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            sse_clients.delete(res);
            unsub();
            if (connection_id && sse_connections.get(connection_id) === res) {
                sse_connections.delete(connection_id);
            }
            for (const [sid, mapped] of [...sse_client_sub_ids.entries()]) {
                if (mapped !== res) continue;
                if (
                    !sse_cleanup_should_unsubscribe(sid, res, web_session_subs, sse_client_sub_ids)
                ) {
                    continue;
                }
                const sub = web_session_subs.get(sid);
                web_session_subs.delete(sid);
                sse_client_sub_ids.delete(sid);
                if (sub) {
                    session_history_deps?.service.unsubscribe(
                        sub.source,
                        sub.env,
                        sub.session_id,
                        sid,
                    );
                }
            }
        };
        req.on("close", cleanup);
        res.on("close", cleanup);
    }

    function handle_request(req: IncomingMessage, res: ServerResponse): void {
        void (async () => {
            const url = new URL(req.url ?? "/", "http://local");
            const is_get = req.method === "GET";

            if (url.pathname === "/v1/health" && is_get) {
                json_response(res, 200, { status: "ok", uptime: process.uptime() });
                return;
            }

            if (web_root && is_get && !url.pathname.startsWith("/v1/")) {
                serve_static(url, res, web_root);
                return;
            }

            if (
                token_stats_store &&
                (await handle_web_read(url, res, {
                    store: token_stats_store,
                    running: token_stats_running,
                    query_dispatcher: token_stats_query_dispatcher,
                }))
            ) {
                return;
            }
            if (await handle_web_trend(req, url, res, observation_store)) {
                return;
            }
            if (config_deps && (await handle_web_config(req, res, url, config_deps))) {
                return;
            }
            if (connector_deps && (await handle_web_connector(req, res, url, connector_deps))) {
                return;
            }
            if (
                session_history_deps &&
                (await handle_web_session_history(req, res, url, session_history_deps, {
                    subs: web_session_subs,
                    sse_clients_by_sub: sse_client_sub_ids,
                    sse_connections,
                    write_event: write_sse_event,
                }))
            ) {
                return;
            }
            if (control_deps && (await handle_web_control(req, res, url, control_deps))) {
                return;
            }
            if (dev_panel_deps && (await handle_web_dev_panel(req, res, url, dev_panel_deps))) {
                return;
            }
            if (url.pathname === "/v1/theme" && req.method === "POST") {
                if (!theme_set) {
                    json_response(res, 503, { error: "theme control unavailable" });
                    return;
                }
                const body = await read_json_body(req, res);
                if (!body.ok) return;
                const mode =
                    typeof body.value === "object" && body.value !== null
                        ? (body.value as Record<string, unknown>)["mode"]
                        : undefined;
                if (mode !== "light" && mode !== "dark" && mode !== "system") {
                    json_response(res, 400, { error: "Invalid theme mode" });
                    return;
                }
                theme_set(mode);
                json_response(res, 200, { status: "ok" });
                return;
            }
            if (auth_deps && (await handle_web_auth(req, res, url, auth_deps))) {
                return;
            }

            if (url.pathname === "/v1/events" && is_get) {
                handle_sse(req, res);
                return;
            }

            if (url.pathname === "/v1/logs/export" && is_get) {
                handle_logs_export(res, user_data_path);
                return;
            }

            if (url.pathname === "/v1/logs/renderer" && req.method === "POST") {
                await handle_renderer_log(req, res);
                return;
            }

            if (url.pathname === "/v1/tokenStats/forceCollect" && req.method === "POST") {
                if (!token_stats_force_collect) {
                    json_response(res, 503, { error: "token stats collect unavailable" });
                    return;
                }
                token_stats_force_collect();
                json_response(res, 200, null);
                return;
            }

            if (!check_auth(req, token)) {
                json_response(res, 401, { error: "Unauthorized" });
                return;
            }

            if (url.pathname === "/v1/ingest" && req.method === "POST") {
                await handle_ingest(req, res);
                return;
            }

            json_response(res, 404, { error: "Not found" });
        })().catch((err: unknown) => {
            log.error("request failed", err);
            if (res.headersSent) {
                res.destroy();
                return;
            }
            json_response(res, 500, { error: "Internal server error" });
        });
    }

    function is_address_in_use(error: unknown): boolean {
        return (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code: string }).code === "EADDRINUSE"
        );
    }

    function listen(target_port: number): Promise<number> {
        const active_server = server;
        if (!active_server) return Promise.reject(new Error("LocalAPI server is not initialized"));

        return new Promise((resolve_fn, reject) => {
            const on_error = (error: Error) => {
                active_server.off("listening", on_listening);
                reject(error);
            };
            const on_listening = () => {
                active_server.off("error", on_error);
                const addr = active_server.address();
                if (addr && typeof addr === "object") {
                    resolve_fn(addr.port);
                    return;
                }
                reject(new Error("LocalAPI server did not bind to a TCP port"));
            };
            active_server.once("error", on_error);
            active_server.once("listening", on_listening);
            active_server.listen(target_port, "0.0.0.0");
        });
    }

    return {
        async start(): Promise<{ port: number; token: string }> {
            if (server) return { port, token };
            server = createServer((req, res) => {
                handle_request(req, res);
            });
            try {
                port = await listen(port);
            } catch (error) {
                if (!is_address_in_use(error)) throw error;
                port = await listen(0);
            }
            log.info(`LocalAPI listening on 0.0.0.0:${String(port)}`);
            return { port, token };
        },
        async stop(): Promise<void> {
            for (const client of sse_clients) {
                client.end();
            }
            sse_clients.clear();
            for (const [sub_id, sub] of [...web_session_subs.entries()]) {
                web_session_subs.delete(sub_id);
                session_history_deps?.service.unsubscribe(
                    sub.source,
                    sub.env,
                    sub.session_id,
                    sub_id,
                );
            }
            sse_client_sub_ids.clear();
            sse_connections.clear();

            if (!server) return;
            const current = server;
            server = null;
            await new Promise<void>((resolve_fn) => {
                current.closeAllConnections();
                current.close(() => {
                    resolve_fn();
                });
            });
        },
        get_port(): number {
            return port;
        },
        get_token(): string {
            return token;
        },
        publish_config_change(cfg: AppConfiguration): void {
            for (const client of sse_clients) {
                write_sse_event(client, "config", cfg);
            }
        },
        publish_theme_change(is_dark: boolean): void {
            for (const client of sse_clients) {
                write_sse_event(client, "theme", { isDark: is_dark });
            }
        },
        publish_control_state(st: ControlState): void {
            for (const client of sse_clients) {
                write_sse_event(client, "control", st);
            }
        },
        broadcast_state(payload: unknown): void {
            for (const client of sse_clients) {
                write_sse_event(client, "state", payload);
            }
        },
        connected_clients(): number {
            return sse_clients.size;
        },
    };
}
