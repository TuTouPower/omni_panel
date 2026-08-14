import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { request as undici_request, Agent, setGlobalDispatcher } from "undici";
import { keyFor } from "../config/secrets-store";
import { createLogger, withLogContext, type Logger } from "../../../shared/lib/logger";
import {
    status_for_pct,
    status_for_ratio,
    status_for_balance,
} from "../../../shared/lib/connector-thresholds";
import { MAX_CONNECTIONS_PER_ORIGIN, KEEPALIVE_TIMEOUT_MS } from "../../../shared/constants";
import { get_proxy_agent } from "../network/proxy-pool";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { VaultBackend } from "../vault/vault-backend";
import type { ConnectorContext, HttpOpts } from "./host-io";

const log = createLogger("net-client");
const sandbox_log = createLogger("connector-sandbox");
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50MB
// t372 AC-002: 错误响应只需计数/日志，小上限读取即可，避免 4xx+大 body 白读 50MB。
const MAX_ERROR_BODY_BYTES = 1 * 1024 * 1024; // 1MB

/**
 * 创建并注册全局 undici Agent（每 origin 连接上限 + keepAlive 复用）。
 * 必须在任何 HTTP 请求前调用一次。连接复用后 TLS 握手从「每请求一次」
 * 降到「每 origin 几次」，消除并发握手风暴。
 */
export function init_global_network(): void {
    const agent = new Agent({
        keepAliveTimeout: KEEPALIVE_TIMEOUT_MS,
        keepAliveMaxTimeout: KEEPALIVE_TIMEOUT_MS,
        connections: MAX_CONNECTIONS_PER_ORIGIN,
    });
    setGlobalDispatcher(agent);
    log.info(
        `Global Agent set: connections=${String(MAX_CONNECTIONS_PER_ORIGIN)}, keepAlive=${String(KEEPALIVE_TIMEOUT_MS)}ms`,
    );
}

async function read_body_with_limit(
    body: Awaited<ReturnType<typeof undici_request>>["body"],
    max_bytes: number,
): Promise<string> {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of body) {
        const buf: Uint8Array = Buffer.isBuffer(chunk)
            ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            : typeof chunk === "string"
              ? Buffer.from(chunk)
              : new Uint8Array(chunk as ArrayBuffer);
        total += buf.byteLength;
        if (total > max_bytes) {
            body.destroy();
            throw new Error(`Response body exceeds ${String(max_bytes)} bytes`);
        }
        chunks.push(buf);
    }
    return Buffer.concat(chunks).toString("utf8");
}

export interface NetClientConfig {
    readonly proxy_url?: string;
    readonly endpoint_overrides?: Record<string, string>;
    readonly timeout_ms?: number;
    readonly params?: Record<string, string>;
    readonly trace_id?: string;
    /** 跳过连接池，强制新建 TCP+TLS 连接。所有请求共享此设置。 */
    readonly reset?: boolean;
}

function expand_home(path_pattern: string): string {
    if (path_pattern === "~") return homedir();
    if (path_pattern.startsWith("~/")) return join(homedir(), path_pattern.slice(2));
    return path_pattern;
}

function is_within_allowed(path: string, allowed: readonly string[]): boolean {
    const resolved = resolve(path);
    // Windows is case-insensitive but preserves case; normalize before comparing
    // so a manifest path "C:\Users\..." still matches an actual "c:\users\...".
    const norm = process.platform === "win32" ? (s: string) => s.toLowerCase() : (s: string) => s;
    const np = norm(resolved);
    for (const root of allowed) {
        const nr = norm(resolve(root));
        if (np === nr || np.startsWith(nr + sep)) return true;
    }
    return false;
}

async function list_dir_recursive(dir: string, depth = 0, max_depth = 10): Promise<string[]> {
    if (depth > max_depth) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        const stat = await lstat(full);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
            const sub = await list_dir_recursive(full, depth + 1, max_depth);
            results.push(...sub);
        } else if (stat.isFile()) {
            results.push(full);
        }
    }
    return results;
}

// Defense against secret exfiltration via a malicious endpoint override: a
// crafted CONFIG_IMPORT could point a connector at a cloud-metadata service,
// and apply_auth would then leak the user's API key there (AWS/GCP/Azure
// instance creds are the prime target). Block known metadata hosts. Private/
// loopback ranges are NOT blocked — local dev connectors and tests use them.
// Note: a public attacker-controlled host is not blocked here; the broader
// defense is requiring secret re-entry on config import (see PLAN.md).
function assert_safe_connector_host(url: URL): void {
    const host = url.hostname.toLowerCase();
    if (
        host === "169.254.169.254" ||
        host === "metadata.google.internal" ||
        host === "metadata.azure.com"
    ) {
        throw new Error(`Refusing connector request to metadata host: ${host}`);
    }
}

// 解析 endpoint 基址：优先用户 override，其次 manifest 声明；requireExplicitEndpoints
// 为真时拒绝隐式回退，防止 CONFIG_IMPORT 把请求重定向到攻击者主机。
function resolve_endpoint_base(
    manifest: Manifest,
    endpoint_key: string,
    overrides?: Record<string, string>,
): string {
    const override = overrides?.[endpoint_key];
    if (override) return override;
    if (manifest.requireExplicitEndpoints) {
        throw new Error(
            `Endpoint "${endpoint_key}" requires explicit configuration; ` +
                `no user-provided override found for connector "${manifest.id}"`,
        );
    }
    const endpoint = manifest.endpoints?.[endpoint_key];
    if (endpoint) return endpoint;
    throw new Error(`Unknown endpoint key: ${endpoint_key}`);
}

// 把 manifest 声明的 auth 注入 url（query 类型）或 headers（bearer/header 类型）。
async function apply_request_auth(
    manifest: Manifest,
    vault: VaultBackend,
    instance_id: string,
    url: URL,
    headers: Record<string, string>,
): Promise<void> {
    const auth = manifest.poll?.request.auth;
    if (!auth) return;
    const value = await vault.get(keyFor(instance_id, auth.secret));
    if (!value) return;

    if (auth.type === "bearer") {
        headers["Authorization"] = `Bearer ${value}`;
        return;
    }
    if (auth.type === "header" && auth.header_name) {
        headers[auth.header_name] = value;
        return;
    }
    if (auth.type === "query" && auth.query_param) {
        url.searchParams.set(auth.query_param, value);
    }
}

// do_request 与 get_raw 共享的请求前奏：URL 构造 → 安全校验 → auth 注入 →
// 超时/AbortController 装配。返回一次性 context，调用方负责 clearTimeout(timeout_id)。
export interface RequestContext {
    url: URL;
    headers: Record<string, string>;
    abort_controller: AbortController;
    timeout_id: NodeJS.Timeout;
    effective_timeout: number;
}

export interface BuildRequestContextOptions {
    path: string;
    endpoint_overrides?: Record<string, string> | undefined;
    initial_headers?: Record<string, string> | undefined;
    extra_headers?: Record<string, string> | undefined;
    default_timeout_ms: number;
    timeout_ms?: number | undefined;
}

export async function build_request_context(
    manifest: Manifest,
    endpoint_name: string,
    vault: VaultBackend,
    instance_id: string,
    options: BuildRequestContextOptions,
): Promise<RequestContext> {
    const base = resolve_endpoint_base(manifest, endpoint_name, options.endpoint_overrides);
    const url = new URL(options.path, base);
    // 拒绝绝对 URL / protocol-relative path 越界到其它 origin：否则
    // `new URL` 会用 path 替换 endpoint base 的主机，把后面注入的 vault
    // 凭据（apikey/cookie）发往任意公网主机。
    const base_url = new URL(base);
    if (url.origin !== base_url.origin) {
        throw new Error(
            `Refusing connector request to origin outside endpoint: ${url.origin}` +
                ` (endpoint origin ${base_url.origin})`,
        );
    }
    assert_safe_connector_host(url);

    const headers: Record<string, string> = { ...(options.initial_headers ?? {}) };
    await apply_request_auth(manifest, vault, instance_id, url, headers);
    const all_headers = { ...headers, ...(options.extra_headers ?? {}) };

    const effective_timeout = options.timeout_ms ?? options.default_timeout_ms;
    const abort_controller = new AbortController();
    const timeout_id = setTimeout(() => {
        // t371 AC-002: abort reason 带明确 timeout 字样——下游 is_timeout_error 分类
        // 依赖（原裸 AbortError「This operation was aborted」无 timeout 无法识别）。
        abort_controller.abort(
            new Error(`HTTP request timed out after ${String(effective_timeout)}ms`),
        );
    }, effective_timeout);

    return {
        url,
        headers: all_headers,
        abort_controller,
        timeout_id,
        effective_timeout,
    };
}

export function create_connector_context(
    manifest: Manifest,
    vault: VaultBackend,
    instance_id: string,
    config: NetClientConfig,
): ConnectorContext {
    const dispatcher = config.proxy_url ? get_proxy_agent(config.proxy_url) : undefined;
    const timeout_ms = config.timeout_ms ?? 15_000;
    const reset = config.reset ?? false;
    const request_log = config.trace_id ? withLogContext(log, { trace_id: config.trace_id }) : log;
    const connector_log = config.trace_id
        ? withLogContext(sandbox_log, { trace_id: config.trace_id })
        : sandbox_log;

    type RawResponse = Awaited<ReturnType<typeof undici_request>>;
    type ResponseHeaders = Record<string, string | string[] | undefined>;

    // do_request 与 get_raw 共享的请求执行体：请求前奏（URL 构造/安全校验/auth
    // 注入/timeout 装配）已由 build_request_context 抽取；此处收敛「request_options
    // 构造 + 请求执行 + timeout/abort 清理 + ≥400 错误分类」。成功路径差异由
    // transform_response 表达；do_request 专属的 content-length 大包预检经
    // pre_read_guard 在读取响应体前执行，不泄漏进 get_raw 路径。
    async function perform_request<T>(params: {
        method: "GET" | "POST";
        endpoint_key: string;
        path: string;
        body?: unknown;
        opts?: HttpOpts | undefined;
        initial_headers?: Record<string, string> | undefined;
        /** 请求行 debug 前缀（do_request 传 method，get_raw 传 "GET RAW"）。 */
        log_prefix: string;
        /** 收到响应后的 debug 前缀；get_raw 无此行则省略该参数。 */
        response_log_prefix?: string;
        /** ≥400 错误分类 debug 行中嵌入的标签（do_request 空串，get_raw " get_raw"）。 */
        error_log_label: string;
        /** 读取响应体前的前置守卫（do_request 的 content-length 大包预检）。 */
        pre_read_guard?: (response: RawResponse) => void;
        transform_response: (
            status: number,
            raw_body: string,
            response_headers: ResponseHeaders,
            request_log: Logger,
            url: URL,
        ) => T;
    }): Promise<T> {
        const ctx = await build_request_context(manifest, params.endpoint_key, vault, instance_id, {
            path: params.path,
            endpoint_overrides: config.endpoint_overrides,
            initial_headers: params.initial_headers,
            extra_headers: params.opts?.headers,
            default_timeout_ms: timeout_ms,
            timeout_ms: params.opts?.timeout_ms,
        });
        const {
            url,
            headers: all_headers,
            abort_controller: ac,
            timeout_id: total_timer,
            effective_timeout,
        } = ctx;

        const request_reset = params.opts?.reset ?? reset;
        request_log.debug(`${params.log_prefix} ${url.origin}${url.pathname}`);
        const request_options = {
            method: params.method,
            headers: all_headers,
            headersTimeout: effective_timeout,
            bodyTimeout: effective_timeout,
            signal: ac.signal,
            ...(params.body !== undefined ? { body: JSON.stringify(params.body) } : {}),
            ...(dispatcher ? { dispatcher } : {}),
            ...(request_reset ? { reset: true } : {}),
        };
        try {
            const response = await undici_request(url, request_options);
            if (params.response_log_prefix !== undefined) {
                request_log.debug(
                    `${params.response_log_prefix} ${url.origin}${url.pathname} → ${String(response.statusCode)}`,
                );
            }

            if (response.statusCode >= 400) {
                // t372 AC-002: 错误响应不读满 50MB。length 优先从 content-length 头取：
                // 已声明超大 body 直接 destroy 不读（保留 HTTP 状态语义），未声明/小 body
                // 才小上限读取，超限即破坏流（read_body_with_limit 内部处理）。
                const content_length_header = response.headers["content-length"];
                const declared_length = Array.isArray(content_length_header)
                    ? content_length_header[0]
                    : content_length_header;
                const declared_bytes = declared_length
                    ? Number.parseInt(declared_length, 10)
                    : undefined;
                if (declared_bytes !== undefined && declared_bytes > MAX_ERROR_BODY_BYTES) {
                    response.body.destroy();
                    request_log.debug(
                        `HTTP ${String(response.statusCode)}${params.error_log_label} response (${String(declared_bytes)} bytes)`,
                    );
                    throw new Error(
                        `HTTP ${String(response.statusCode)}: request failed (${String(declared_bytes)} bytes)`,
                    );
                }
                const error_body = await read_body_with_limit(response.body, MAX_ERROR_BODY_BYTES);
                const byte_count = declared_bytes ?? Buffer.byteLength(error_body);
                request_log.debug(
                    `HTTP ${String(response.statusCode)}${params.error_log_label} response (${String(byte_count)} bytes)`,
                );
                throw new Error(
                    `HTTP ${String(response.statusCode)}: request failed (${String(byte_count)} bytes)`,
                );
            }

            params.pre_read_guard?.(response);

            const text = await read_body_with_limit(response.body, MAX_RESPONSE_BYTES);
            return params.transform_response(
                response.statusCode,
                text,
                response.headers,
                request_log,
                url,
            );
        } finally {
            clearTimeout(total_timer);
        }
    }

    async function do_request(
        method: "GET" | "POST",
        endpoint_key: string,
        path: string,
        body?: unknown,
        opts?: HttpOpts,
    ): Promise<unknown> {
        return perform_request({
            method,
            endpoint_key,
            path,
            body,
            opts,
            initial_headers: { "Content-Type": "application/json" },
            log_prefix: method,
            response_log_prefix: method,
            error_log_label: "",
            pre_read_guard: (response) => {
                const content_length_header = response.headers["content-length"];
                const content_length = Array.isArray(content_length_header)
                    ? content_length_header[0]
                    : content_length_header;
                if (content_length) {
                    const size = Number.parseInt(content_length, 10);
                    if (size > MAX_RESPONSE_BYTES) {
                        response.body.destroy();
                        throw new Error(`Response body too large: ${String(size)} bytes`);
                    }
                }
            },
            transform_response(status, text, response_headers, req_log, url) {
                req_log.debug(
                    `${method} ${url.origin}${url.pathname} body=${String(text.length)} bytes`,
                );
                if (text.length === 0) {
                    return null;
                }

                const ct = response_headers["content-type"];
                const content_type = Array.isArray(ct) ? ct[0] : ct;
                if (
                    typeof content_type === "string" &&
                    content_type.toLowerCase().includes("text/html")
                ) {
                    throw new Error(
                        `Received HTML response instead of JSON (possible interception page)`,
                    );
                }

                try {
                    return JSON.parse(text) as unknown;
                } catch (parse_error) {
                    // 不打响应体原文：错误页/拦截页/类 JSON 响应可能含凭据、会话或 PII。
                    req_log.warn(`JSON parse failed for ${url.origin}${url.pathname}`, {
                        status,
                        contentType: content_type,
                        bodyBytes: text.length,
                    });
                    throw parse_error;
                }
            },
        });
    }

    return {
        ...(config.trace_id ? { trace_id: config.trace_id } : {}),
        log: {
            debug: (message: string, meta?: unknown) => {
                connector_log.debug(`[${manifest.id}] ${message}`, meta);
            },
            info: (message: string, meta?: unknown) => {
                connector_log.info(`[${manifest.id}] ${message}`, meta);
            },
            warn: (message: string, meta?: unknown) => {
                connector_log.warn(`[${manifest.id}] ${message}`, meta);
            },
            error: (message: string, meta?: unknown) => {
                connector_log.error(`[${manifest.id}] ${message}`, meta);
            },
        },
        http: {
            get_json(endpoint_key: string, path: string, opts?: HttpOpts) {
                return do_request("GET", endpoint_key, path, undefined, opts);
            },
            post_json(endpoint_key: string, path: string, body: unknown, opts?: HttpOpts) {
                return do_request("POST", endpoint_key, path, body, opts);
            },
            async get_raw(endpoint_key: string, path: string, opts?: HttpOpts) {
                return perform_request({
                    method: "GET",
                    endpoint_key,
                    path,
                    opts,
                    log_prefix: "GET RAW",
                    error_log_label: " get_raw",
                    transform_response(status, text, response_headers) {
                        const raw_headers: Record<string, string> = {};
                        for (const [key, value] of Object.entries(response_headers)) {
                            if (value !== undefined) {
                                raw_headers[key.toLowerCase()] = Array.isArray(value)
                                    ? (value[0] ?? "")
                                    : value;
                            }
                        }
                        return {
                            status,
                            headers: raw_headers,
                            body: text,
                        };
                    },
                });
            },
        },
        files: {
            read(path_pattern: string) {
                const allowed = manifest.local?.paths ?? [];
                const expanded = expand_home(path_pattern);
                const resolved_path = resolve(expanded);
                if (!is_within_allowed(resolved_path, allowed)) {
                    return Promise.reject(new Error("Local file path is not allowed"));
                }
                return (async () => {
                    const stat = await lstat(resolved_path);
                    if (stat.isSymbolicLink()) {
                        const real = await realpath(resolved_path);
                        if (!is_within_allowed(real, allowed)) {
                            throw new Error("symlink target outside allowed directories");
                        }
                    }
                    return readFile(resolved_path, "utf8");
                })();
            },
            async list(dir_pattern: string) {
                const allowed = manifest.local?.paths ?? [];
                const expanded = expand_home(dir_pattern);
                if (!is_within_allowed(expanded, allowed)) {
                    throw new Error("Local directory is not allowed");
                }
                return list_dir_recursive(expanded);
            },
        },
        params: config.params ?? {},
        status: {
            for_pct: status_for_pct,
            for_ratio: status_for_ratio,
            for_balance: status_for_balance,
        },
        // 实际收集由 run_connector 注入的 wrapper 负责；此处仅为满足
        // ConnectorContext 契约，脚本不会直接走到此 no-op（script 路径必经
        // run_connector 包装）。
        report_failed_account: () => undefined,
    };
}
