import { lstat, readFile, realpath, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { request as undici_request, ProxyAgent } from "undici";
import { keyFor } from "../config/secrets-store";
import { createLogger, withLogContext } from "../../../shared/lib/logger";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { VaultBackend } from "../vault/vault-backend";
import type { ConnectorContext, HttpOpts } from "./host-io";

const log = createLogger("net-client");
const sandbox_log = createLogger("connector-sandbox");
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50MB

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
}

function expand_home(path_pattern: string): string {
    if (path_pattern === "~") return homedir();
    if (path_pattern.startsWith("~/")) return join(homedir(), path_pattern.slice(2));
    return path_pattern;
}

function is_within_allowed(path: string, allowed: readonly string[]): boolean {
    const resolved = resolve(path);
    for (const root of allowed) {
        const resolved_root = resolve(root);
        if (resolved === resolved_root) return true;
        if (resolved.startsWith(resolved_root + sep)) return true;
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

export function create_connector_context(
    manifest: Manifest,
    vault: VaultBackend,
    instance_id: string,
    config: NetClientConfig,
): ConnectorContext {
    const dispatcher = config.proxy_url ? new ProxyAgent(config.proxy_url) : undefined;
    const timeout_ms = config.timeout_ms ?? 15_000;
    const request_log = config.trace_id ? withLogContext(log, { trace_id: config.trace_id }) : log;
    const connector_log = config.trace_id
        ? withLogContext(sandbox_log, { trace_id: config.trace_id })
        : sandbox_log;

    function resolve_endpoint(endpoint_key: string): string {
        const override = config.endpoint_overrides?.[endpoint_key];
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

    async function apply_auth(url: URL, headers: Record<string, string>): Promise<void> {
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

    async function do_request(
        method: "GET" | "POST",
        endpoint_key: string,
        path: string,
        body?: unknown,
        opts?: HttpOpts,
    ): Promise<unknown> {
        const url = new URL(path, resolve_endpoint(endpoint_key));
        assert_safe_connector_host(url);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        await apply_auth(url, headers);

        const all_headers = {
            ...headers,
            ...(opts?.headers ?? {}),
        };

        request_log.debug(`${method} ${url.origin}${url.pathname}`);
        const effective_timeout = opts?.timeout_ms ?? timeout_ms;
        const ac = new AbortController();
        const total_timer = setTimeout(() => {
            ac.abort();
        }, effective_timeout);
        const request_options = {
            method,
            headers: all_headers,
            headersTimeout: effective_timeout,
            bodyTimeout: effective_timeout,
            signal: ac.signal,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            ...(dispatcher ? { dispatcher } : {}),
        };
        try {
            const response = await undici_request(url, request_options);
            request_log.debug(
                `${method} ${url.origin}${url.pathname} → ${String(response.statusCode)}`,
            );

            if (response.statusCode >= 400) {
                const body_text = await read_body_with_limit(response.body, MAX_RESPONSE_BYTES);
                request_log.debug(`HTTP ${String(response.statusCode)} response body`, {
                    body: body_text.slice(0, 200),
                    url,
                });
                throw new Error(
                    `HTTP ${String(response.statusCode)}: request failed (${String(body_text.length)} bytes)`,
                );
            }

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

            const text = await read_body_with_limit(response.body, MAX_RESPONSE_BYTES);
            request_log.debug(
                `${method} ${url.origin}${url.pathname} body=${String(text.length)} bytes`,
            );
            if (text.length === 0) {
                return null;
            }

            const ct = response.headers["content-type"];
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
                request_log.warn(`JSON parse failed for ${url.origin}${url.pathname}: ${text}`);
                throw parse_error;
            }
        } finally {
            clearTimeout(total_timer);
        }
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
                const url = new URL(path, resolve_endpoint(endpoint_key));
                assert_safe_connector_host(url);
                const headers: Record<string, string> = {};
                await apply_auth(url, headers);

                const all_headers = {
                    ...headers,
                    ...(opts?.headers ?? {}),
                };

                request_log.debug(`GET RAW ${url.origin}${url.pathname}`);
                const effective_timeout = opts?.timeout_ms ?? timeout_ms;
                const ac = new AbortController();
                const total_timer = setTimeout(() => {
                    ac.abort();
                }, effective_timeout);
                const request_options = {
                    method: "GET" as const,
                    headers: all_headers,
                    headersTimeout: effective_timeout,
                    bodyTimeout: effective_timeout,
                    signal: ac.signal,
                    ...(dispatcher ? { dispatcher } : {}),
                };
                try {
                    const response = await undici_request(url, request_options);

                    if (response.statusCode >= 400) {
                        const body_text = await read_body_with_limit(
                            response.body,
                            MAX_RESPONSE_BYTES,
                        );
                        request_log.debug(
                            `HTTP ${String(response.statusCode)} get_raw response body`,
                            {
                                body: body_text.slice(0, 200),
                                url: url.toString(),
                            },
                        );
                        throw new Error(
                            `HTTP ${String(response.statusCode)}: request failed (${String(body_text.length)} bytes)`,
                        );
                    }

                    const response_headers: Record<string, string> = {};
                    for (const [key, value] of Object.entries(response.headers)) {
                        if (value !== undefined) {
                            response_headers[key.toLowerCase()] = Array.isArray(value)
                                ? (value[0] ?? "")
                                : value;
                        }
                    }

                    const text = await read_body_with_limit(response.body, MAX_RESPONSE_BYTES);

                    return {
                        status: response.statusCode,
                        headers: response_headers,
                        body: text,
                    };
                } finally {
                    clearTimeout(total_timer);
                }
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
    };
}
