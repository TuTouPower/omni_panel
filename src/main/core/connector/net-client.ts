import type { Dirent } from "node:fs";
import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import * as os from "node:os";
import { join, normalize, resolve } from "node:path";
import { request as undici_request, Agent, setGlobalDispatcher } from "undici";
import { z } from "zod/v3";
import { keyFor } from "../config/secrets-store";
import { createLogger, withLogContext, scrubber, type Logger } from "../../../shared/lib/logger";
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
// A10 / A130: 响应体上限从 50MB 降至 10MB，避免并发放大
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB
// t372 AC-002: 错误响应只需计数/日志，小上限读取即可，避免 4xx+大 body 白读 10MB。
const MAX_ERROR_BODY_BYTES = 1 * 1024 * 1024; // 1MB
// A11 / A114: 目录遍历最大文件项数量上限
const MAX_LIST_FILES = 5000;

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
    if (path_pattern === "~") return os.homedir();
    if (path_pattern.startsWith("~/")) return join(os.homedir(), path_pattern.slice(2));
    if (path_pattern.startsWith("~\\")) return join(os.homedir(), path_pattern.slice(2));
    return path_pattern;
}

function canonical_path(value: string): string {
    return normalize(resolve(expand_home(value)))
        .replace(/[\\/]+/g, "/")
        .replace(/\/$/, "")
        .toLowerCase();
}

function is_within_allowed(path: string, allowed: readonly string[]): boolean {
    const normalized_path = canonical_path(path);
    for (const root of allowed) {
        const normalized_root = canonical_path(root);
        if (
            normalized_path === normalized_root ||
            normalized_path.startsWith(`${normalized_root}/`)
        ) {
            return true;
        }
    }
    return false;
}

async function list_dir_recursive(
    dir: string,
    allowed: readonly string[],
    depth = 0,
    max_depth = 10,
    counter = { count: 0 },
): Promise<string[]> {
    if (depth > max_depth || counter.count >= MAX_LIST_FILES) return [];
    let entries: Dirent[];
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }

    const results: string[] = [];
    // A114: 并发化遍历子目录
    const tasks = entries.map(async (entry) => {
        if (counter.count >= MAX_LIST_FILES) return [];
        const full = join(dir, entry.name);
        try {
            const stat = await lstat(full);
            if (stat.isSymbolicLink()) {
                // A11: 软链跳过，防御逃逸与循环引用
                return [];
            }
            if (stat.isDirectory()) {
                return await list_dir_recursive(full, allowed, depth + 1, max_depth, counter);
            }
            if (stat.isFile()) {
                if (counter.count < MAX_LIST_FILES) {
                    counter.count++;
                    return [full];
                }
            }
        } catch {
            // 忽略文件读取瞬时异常
        }
        return [];
    });

    const sub_results = await Promise.all(tasks);
    for (const sub of sub_results) {
        results.push(...sub);
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

// A109: 安全边界函数内部化，仅通过 __test__ 导出用于单测
async function build_request_context(
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

    // A61 / A131: <= 0 或非有限值回退至默认值，防止自杀
    const raw_timeout = options.timeout_ms ?? options.default_timeout_ms;
    const effective_timeout =
        Number.isFinite(raw_timeout) && raw_timeout > 0 ? raw_timeout : options.default_timeout_ms;

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

    // A103 / A134: 统一抽离 raw headers 归一化逻辑，保留多值头数组
    function normalize_raw_headers(
        response_headers: ResponseHeaders,
    ): Record<string, string | string[]> {
        const raw_headers: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(response_headers)) {
            if (value !== undefined) {
                raw_headers[key.toLowerCase()] = Array.isArray(value) ? [...value] : value;
            }
        }
        return raw_headers;
    }

    // A96: perform_request 参数收敛为对象，log 标签由 kind/method 派生
    interface PerformRequestOptions<T> {
        kind: "json" | "raw";
        method: "GET" | "POST";
        endpoint_key: string;
        path: string;
        body?: unknown;
        opts?: HttpOpts | undefined;
        initial_headers?: Record<string, string> | undefined;
        pre_read_guard?: (response: RawResponse) => void;
        transform_response: (
            status: number,
            raw_body: string,
            response_headers: ResponseHeaders,
            request_log: Logger,
            url: URL,
        ) => T;
    }

    async function perform_request<T>(params: PerformRequestOptions<T>): Promise<T> {
        const is_raw = params.kind === "raw";
        const log_prefix = is_raw ? `${params.method} RAW` : params.method;
        const error_log_label = is_raw ? ` ${params.method.toLowerCase()}_raw` : "";

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
        request_log.debug(`${log_prefix} ${url.origin}${url.pathname}`);
        const request_options = {
            method: params.method,
            headers: all_headers,
            headersTimeout: effective_timeout,
            bodyTimeout: effective_timeout,
            signal: ac.signal,
            ...(params.body !== undefined
                ? {
                      body:
                          typeof params.body === "string"
                              ? params.body
                              : JSON.stringify(params.body),
                  }
                : {}),
            ...(dispatcher ? { dispatcher } : {}),
            ...(request_reset ? { reset: true } : {}),
        };
        try {
            const response = await undici_request(url, request_options);
            request_log.debug(
                `${log_prefix} ${url.origin}${url.pathname} → ${String(response.statusCode)}`,
            );

            if (response.statusCode >= 400) {
                // t372 AC-002: 错误响应不读满 10MB。length 优先从 content-length 头取：
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
                        `HTTP ${String(response.statusCode)}${error_log_label} response (${String(declared_bytes)} bytes)`,
                    );
                    throw new Error(
                        `HTTP ${String(response.statusCode)}: request failed (${String(declared_bytes)} bytes)`,
                    );
                }
                const error_body = await read_body_with_limit(response.body, MAX_ERROR_BODY_BYTES);
                const byte_count = declared_bytes ?? Buffer.byteLength(error_body);

                // A29 / AC-003: 4xx 客户端异常保留前 500B 脱敏片段用于诊断；5xx 保持紧凑状态
                let snippet_str = "";
                if (response.statusCode >= 400 && response.statusCode < 500) {
                    const raw_snippet = error_body
                        .slice(0, 500)
                        .replace(/[\r\n\t\s]+/g, " ")
                        .trim();
                    const scrubbed_snippet = scrubber.scrub_text(raw_snippet);
                    if (scrubbed_snippet.length > 0) {
                        snippet_str = ` [${scrubbed_snippet}]`;
                    }
                }

                request_log.debug(
                    `HTTP ${String(response.statusCode)}${error_log_label} response (${String(byte_count)} bytes)${snippet_str}`,
                );
                throw new Error(
                    `HTTP ${String(response.statusCode)}: request failed (${String(byte_count)} bytes)${snippet_str}`,
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
            kind: "json",
            method,
            endpoint_key,
            path,
            body,
            opts,
            initial_headers: { "Content-Type": "application/json" },
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

                let data: unknown;
                try {
                    data = JSON.parse(text) as unknown;
                } catch (parse_error) {
                    // 不打响应体原文：错误页/拦截页/类 JSON 响应可能含凭据、会话或 PII。
                    req_log.warn(`JSON parse failed for ${url.origin}${url.pathname}`, {
                        status,
                        contentType: content_type,
                        bodyBytes: text.length,
                    });
                    throw parse_error;
                }

                // A128 / AC-007: 外部网络输入边界 zod safeParse 防御
                if (opts?.schema) {
                    const parsed = opts.schema.safeParse(data);
                    if (!parsed.success) {
                        const detail = parsed.error.issues
                            .slice(0, 3)
                            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                            .join("; ");
                        req_log.warn(
                            `Response schema validation failed for ${url.origin}${url.pathname}: ${detail}`,
                        );
                        throw new Error(`Response schema validation failed: ${detail}`);
                    }
                    return parsed.data;
                }

                return data;
            },
        });
    }

    return {
        ...(config.trace_id ? { trace_id: config.trace_id } : {}),
        instance_id,
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
                    kind: "raw",
                    method: "GET",
                    endpoint_key,
                    path,
                    opts,
                    transform_response(status, text, response_headers) {
                        return {
                            status,
                            headers: normalize_raw_headers(response_headers),
                            body: text,
                        };
                    },
                });
            },
            async post_raw(endpoint_key: string, path: string, body: unknown, opts?: HttpOpts) {
                return perform_request({
                    kind: "raw",
                    method: "POST",
                    endpoint_key,
                    path,
                    body,
                    opts,
                    initial_headers: { "Content-Type": "text/plain;charset=UTF-8" },
                    transform_response(status, text, response_headers) {
                        return {
                            status,
                            headers: normalize_raw_headers(response_headers),
                            body: text,
                        };
                    },
                });
            },
        },
        files: {
            async read(path_pattern: string) {
                const allowed = manifest.local?.paths ?? [];
                const expanded = expand_home(path_pattern);
                const resolved_path = resolve(expanded);
                if (!is_within_allowed(resolved_path, allowed)) {
                    throw new Error("Local file path is not allowed");
                }
                // A11: 解析真实路径，彻底杜绝中间软链与 TOCTOU 逃逸
                const real = await realpath(resolved_path);
                if (!is_within_allowed(real, allowed)) {
                    throw new Error("symlink target outside allowed directories");
                }
                return readFile(real, "utf8");
            },
            async list(dir_pattern: string) {
                const allowed = manifest.local?.paths ?? [];
                const resolved_dir = resolve(expand_home(dir_pattern));
                if (!is_within_allowed(resolved_dir, allowed)) {
                    throw new Error("Local directory is not allowed");
                }
                // A11: 顶层目录真实路径校验
                const real_dir = await realpath(resolved_dir);
                if (!is_within_allowed(real_dir, allowed)) {
                    throw new Error("Local directory is not allowed");
                }
                return list_dir_recursive(real_dir, allowed);
            },
        },
        params: config.params ?? {},
        status: {
            for_pct: status_for_pct,
            for_ratio: status_for_ratio,
            for_balance: status_for_balance,
        },
        z,
        // A99: 注入统一工具函数，消除跨连接器私有重复代码
        util: {
            to_number: (value: unknown, fallback = 0): number => {
                const parsed = typeof value === "number" ? value : Number(value ?? fallback);
                return Number.isFinite(parsed) ? parsed : fallback;
            },
            to_pct: (value: unknown): number => {
                const raw = typeof value === "number" ? value : Number(value ?? 0);
                const pct = raw <= 1 && raw > 0 ? raw * 100 : raw;
                return Math.round(Math.max(0, Math.min(pct, 100)) * 10) / 10;
            },
            to_reset_at: (value: unknown): number | null => {
                if (typeof value !== "string" || !value) return null;
                const ts = Date.parse(value);
                return Number.isFinite(ts) ? ts : null;
            },
            clamp: (value: number, min: number, max: number): number => {
                return Math.max(min, Math.min(value, max));
            },
        },
        report_failed_account: () => undefined,
    };
}

// A109: 测试专用导出命名空间，收敛内部安全边界函数
export const __test__ = {
    build_request_context,
    assert_safe_connector_host,
    is_within_allowed,
    list_dir_recursive,
    read_body_with_limit,
    MAX_RESPONSE_BYTES,
    MAX_ERROR_BODY_BYTES,
    MAX_LIST_FILES,
};
