import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { request as undici_request, ProxyAgent } from "undici";
import { createLogger } from "../../../shared/lib/logger";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { VaultBackend } from "../vault/vault-backend";
import type { ConnectorContext, HttpOpts } from "./host-io";

const log = createLogger("net-client");
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB

export interface NetClientConfig {
    readonly proxy_url?: string;
    readonly endpoint_overrides?: Record<string, string>;
    readonly timeout_ms?: number;
    readonly params?: Record<string, string>;
}

function expand_home(path_pattern: string): string {
    if (path_pattern === "~") return homedir();
    if (path_pattern.startsWith("~/")) return join(homedir(), path_pattern.slice(2));
    return path_pattern;
}

export function create_connector_context(
    manifest: Manifest,
    vault: VaultBackend,
    instance_id: string,
    config: NetClientConfig,
): ConnectorContext {
    const dispatcher = config.proxy_url ? new ProxyAgent(config.proxy_url) : undefined;
    const timeout_ms = config.timeout_ms ?? 15_000;

    function resolve_endpoint(endpoint_key: string): string {
        const override = config.endpoint_overrides?.[endpoint_key];
        if (override) return override;
        const endpoint = manifest.endpoints?.[endpoint_key];
        if (endpoint) return endpoint;
        throw new Error(`Unknown endpoint key: ${endpoint_key}`);
    }

    async function apply_auth(url: URL, headers: Record<string, string>): Promise<void> {
        const auth = manifest.poll?.request.auth;
        if (!auth) return;
        const value = await vault.get(`${instance_id}:${auth.secret}`);
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
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        await apply_auth(url, headers);

        const all_headers = {
            ...headers,
            ...(opts?.headers ?? {}),
        };

        log.debug(`${method} ${url.origin}${url.pathname}`);
        const request_options = {
            method,
            headers: all_headers,
            headersTimeout: opts?.timeout_ms ?? timeout_ms,
            bodyTimeout: opts?.timeout_ms ?? timeout_ms,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            ...(dispatcher ? { dispatcher } : {}),
        };
        const response = await undici_request(url, request_options);

        if (response.statusCode >= 400) {
            await response.body.text();
            throw new Error(`HTTP ${String(response.statusCode)}`);
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

        const text = await response.body.text();
        if (text.length === 0) {
            return null;
        }
        if (text.length > MAX_RESPONSE_BYTES) {
            throw new Error(`Response body too large: ${String(text.length)} bytes`);
        }

        return JSON.parse(text) as unknown;
    }

    return {
        http: {
            get_json(endpoint_key: string, path: string, opts?: HttpOpts) {
                return do_request("GET", endpoint_key, path, undefined, opts);
            },
            post_json(endpoint_key: string, path: string, body: unknown, opts?: HttpOpts) {
                return do_request("POST", endpoint_key, path, body, opts);
            },
        },
        files: {
            read(path_pattern: string) {
                const allowed_paths = manifest.local?.paths ?? [];
                if (!allowed_paths.includes(path_pattern)) {
                    return Promise.reject(new Error("Local file path is not allowed"));
                }
                return readFile(expand_home(path_pattern), "utf8");
            },
        },
        params: config.params ?? {},
    };
}
