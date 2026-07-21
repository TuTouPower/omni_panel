import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import { observation_ingest_schema } from "../../../shared/schemas/observation";
import type { Observation } from "../../../shared/types/observation";
import type { ObservationStore } from "../observation/observation-store";
import { build_trend_series, type TrendPoint } from "../../../shared/lib/trend";
import type { TokenStatsStore } from "../token-stats/token-stats-store";
import {
    handleConfigGet,
    handleConfigGetSecrets,
    handleConfigSave,
    handleConfigSaveSecrets,
} from "../../ipc/config-ipc";
import type { ConfigIpcDeps } from "../../ipc/config-ipc";
import {
    handleConnectorGetState,
    handleConnectorList,
    handleConnectorRefresh,
    handleConnectorRefreshAll,
} from "../../ipc/connector-ipc";
import type { ConnectorIpcDeps } from "../../ipc/connector-ipc";
import type { IpcResult } from "../../../shared/types/ipc";

const log = createLogger("local-api");
const DEFAULT_PORT = 17863;
const MAX_BODY_BYTES = 1024 * 1024;

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
};

class RequestBodyTooLargeError extends Error {}

export interface LocalAPIServer {
    start(): Promise<{ port: number; token: string }>;
    stop(): Promise<void>;
    get_port(): number;
    get_token(): string;
}

function generate_token(): string {
    return randomBytes(32).toString("hex");
}

function parse_body(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total_size = 0;
        let too_large = false;
        req.on("data", (chunk: Buffer) => {
            if (too_large) return;
            total_size += chunk.byteLength;
            if (total_size > MAX_BODY_BYTES) {
                too_large = true;
                req.pause();
                reject(new RequestBodyTooLargeError("Request body too large"));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (!too_large) resolve(Buffer.concat(chunks));
        });
        req.on("error", reject);
    });
}

async function read_json_body(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
    try {
        return JSON.parse((await parse_body(req)).toString("utf8"));
    } catch (err) {
        if (err instanceof RequestBodyTooLargeError) {
            json_response(res, 413, { error: "Request body too large" });
        } else {
            json_response(res, 400, { error: "Invalid JSON" });
        }
        return null;
    }
}

function send_result<T>(res: ServerResponse, result: IpcResult<T>): void {
    if (result.ok) {
        json_response(res, 200, result.data);
    } else {
        json_response(res, 400, result.error);
    }
}

/**
 * Path-traversal guard for static file serving.
 *
 * `startsWith(web_root)` is a string prefix compare and is bypassable by a
 * sibling directory sharing the prefix (web_root=/app/web, target=/app/web-secret).
 * `path.relative` detects that as a leading ".." — and also catches unrelated
 * absolute paths (different drive on Windows → absolute relative result).
 */
export function is_within_web_root(web_root: string, resolved: string): boolean {
    const rel = path.relative(web_root, resolved);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Serve a static file from web_root, falling back to index.html (SPA). */
function serve_static(url: URL, res: ServerResponse, web_root: string): void {
    const requested = decodeURIComponent(url.pathname);
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
            const headers: Record<string, string> = { "Content-Type": content_type };
            // Never cache the SPA shell — assets use hashed filenames so they
            // cache safely, but index.html must always revalidate so new builds
            // appear on refresh instead of a stale bundle.
            if (file_path.endsWith(".html")) {
                headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            }
            res.writeHead(200, headers);
            res.end(data);
        });
    });
}

function check_auth(req: IncomingMessage, token: string): boolean {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return false;
    const actual = Buffer.from(auth.slice(7), "utf8");
    const expected = Buffer.from(token, "utf8");
    return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function json_response(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

function is_address_in_use(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EADDRINUSE"
    );
}

export function create_local_api_server(
    observation_store: ObservationStore,
    options?: {
        port?: number;
        token_stats_store?: TokenStatsStore;
        config_deps?: ConfigIpcDeps;
        connector_deps?: ConnectorIpcDeps;
        web_root?: string;
    },
): LocalAPIServer {
    const token = generate_token();
    const token_stats_store = options?.token_stats_store;
    const config_deps = options?.config_deps;
    const connector_deps = options?.connector_deps;
    const web_root = options?.web_root;
    const env_port = Number(process.env["OMNI_USAGE_PORT"] ?? "");
    let port =
        options?.port ?? (Number.isFinite(env_port) && env_port > 0 ? env_port : DEFAULT_PORT);
    let server: ReturnType<typeof createServer> | null = null;

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

        const result = observation_ingest_schema.safeParse(parsed);
        if (!result.success) {
            json_response(res, 400, { error: result.error.message });
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

    function handle_request(req: IncomingMessage, res: ServerResponse): void {
        void (async () => {
            const url = new URL(req.url ?? "/", "http://local");
            const is_get = req.method === "GET";

            if (url.pathname === "/v1/health" && is_get) {
                json_response(res, 200, { status: "ok", uptime: process.uptime() });
                return;
            }

            // Static web UI assets (non-API GET), no auth — serves the panel.
            if (web_root && is_get && !url.pathname.startsWith("/v1/")) {
                serve_static(url, res, web_root);
                return;
            }

            // Web read endpoints serve the panel UI without auth (intranet use
            // per project decision). ingest stays token-gated below.
            if (is_get && token_stats_store && handle_web_read(url, res, token_stats_store)) {
                return;
            }
            if (is_get && handle_web_trend(url, res, observation_store)) {
                return;
            }
            if (config_deps && (await handle_web_config(req, res, url, config_deps))) {
                return;
            }
            if (connector_deps && (await handle_web_connector(req, res, url, connector_deps))) {
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
            json_response(res, 500, { error: "Internal server error" });
        });
    }

    function handle_web_read(url: URL, res: ServerResponse, store: TokenStatsStore): boolean {
        const params = url.searchParams;
        const env = params.get("env");
        const agent = params.get("agent");
        const start = params.get("start");
        const end = params.get("end");
        switch (url.pathname) {
            case "/v1/records":
                json_response(
                    res,
                    200,
                    store.query_records({
                        ...(agent
                            ? { agent: agent as "claude-code" | "opencode" | "kimi-code" }
                            : {}),
                        ...(env ? { env: env as "win" | "wsl" } : {}),
                        ...(start ? { start: Number(start) } : {}),
                        ...(end ? { end: Number(end) } : {}),
                    }),
                );
                return true;
            case "/v1/sessions":
                json_response(
                    res,
                    200,
                    store.query_sessions({
                        ...(env ? { env } : {}),
                    }),
                );
                return true;
            case "/v1/buckets":
                json_response(
                    res,
                    200,
                    store.query_buckets({
                        ...(env ? { env } : {}),
                    }),
                );
                return true;
            case "/v1/status":
                json_response(res, 200, {
                    running: true,
                    last_updated: store.last_updated(),
                });
                return true;
            default:
                return false;
        }
    }

    function handle_web_trend(url: URL, res: ServerResponse, store: ObservationStore): boolean {
        if (url.pathname !== "/v1/trend") return false;
        const provider = url.searchParams.get("provider");
        const accountId = url.searchParams.get("accountId");
        const metricId = url.searchParams.get("metricId");
        const days_raw = url.searchParams.get("days");
        if (!provider || !accountId || !metricId) {
            json_response(res, 400, {
                error: "provider, accountId, metricId are required",
            });
            return true;
        }
        const days =
            days_raw !== null && Number.isFinite(Number(days_raw)) && Number(days_raw) > 0
                ? Math.floor(Number(days_raw))
                : 7;
        const records = store.query_trend_series(provider, accountId, metricId, days);
        const series: (TrendPoint | null)[] = build_trend_series(records);
        json_response(res, 200, series);
        return true;
    }

    async function handle_web_config(
        req: IncomingMessage,
        res: ServerResponse,
        url: URL,
        deps: ConfigIpcDeps,
    ): Promise<boolean> {
        if (url.pathname === "/v1/config") {
            if (req.method === "GET") {
                send_result(res, await handleConfigGet(deps));
                return true;
            }
            if (req.method === "POST") {
                const parsed = await read_json_body(req, res);
                if (parsed === null) return true;
                send_result(res, await handleConfigSave(deps, parsed));
                return true;
            }
            return false;
        }
        if (url.pathname === "/v1/secrets") {
            if (req.method === "GET") {
                const instance_id = url.searchParams.get("instanceId");
                if (!instance_id) {
                    json_response(res, 400, { error: "instanceId required" });
                    return true;
                }
                send_result(res, await handleConfigGetSecrets(deps, { instanceId: instance_id }));
                return true;
            }
            if (req.method === "POST") {
                const parsed = await read_json_body(req, res);
                if (parsed === null) return true;
                send_result(res, await handleConfigSaveSecrets(deps, parsed));
                return true;
            }
            return false;
        }
        return false;
    }

    async function handle_web_connector(
        req: IncomingMessage,
        res: ServerResponse,
        url: URL,
        deps: ConnectorIpcDeps,
    ): Promise<boolean> {
        if (url.pathname === "/v1/connectors") {
            if (req.method === "GET") {
                send_result(res, await handleConnectorList(deps));
                return true;
            }
            if (req.method === "POST") {
                send_result(res, await handleConnectorRefreshAll(deps));
                return true;
            }
            return false;
        }
        const match = /^\/v1\/connectors\/([^/]+)\/(state|refresh)$/.exec(url.pathname);
        if (match) {
            const instance_id = decodeURIComponent(match[1] ?? "");
            const action = match[2];
            if (action === "state" && req.method === "GET") {
                let result: IpcResult<unknown>;
                try {
                    result = handleConnectorGetState(deps, instance_id);
                } catch (err: unknown) {
                    result = {
                        ok: false,
                        error: { code: "INTERNAL_ERROR", message: String(err) },
                    };
                }
                send_result(res, result);
                return true;
            }
            if (action === "refresh" && req.method === "POST") {
                send_result(res, await handleConnectorRefresh(deps, instance_id));
                return true;
            }
        }
        return false;
    }

    function listen(target_port: number): Promise<number> {
        const active_server = server;
        if (!active_server) return Promise.reject(new Error("LocalAPI server is not initialized"));

        return new Promise((resolve, reject) => {
            const on_error = (error: Error) => {
                active_server.off("listening", on_listening);
                reject(error);
            };
            const on_listening = () => {
                active_server.off("error", on_error);
                const addr = active_server.address();
                if (addr && typeof addr === "object") {
                    resolve(addr.port);
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
        async start() {
            if (server) return { port, token };
            server = createServer(handle_request);
            try {
                port = await listen(port);
            } catch (error) {
                if (!is_address_in_use(error)) throw error;
                port = await listen(0);
            }
            log.info(`LocalAPI listening on 0.0.0.0:${String(port)}`);
            return { port, token };
        },

        async stop() {
            const active_server = server;
            if (!active_server) return;
            await new Promise<void>((resolve, reject) => {
                active_server.close((error?: Error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            server = null;
        },

        get_port() {
            return port;
        },

        // DESIGN: get_token() returns plaintext by necessity — callers (e.g. IPC
        // to renderer, bearer-token validation) need the raw value.  Callers must
        // redact before logging or persisting.
        get_token() {
            return token;
        },
    };
}
