import { Agent, request, type Dispatcher, ProxyAgent } from "undici";
import type { Result } from "./errors";
import { resolveEndpoint } from "./endpoints";

export interface HttpRequestOptions {
    readonly method?: "GET" | "POST" | "PUT" | "DELETE";
    readonly headers?: Record<string, string>;
    readonly body?: unknown;
    readonly timeoutMs?: number;
    readonly query?: Record<string, string | number | boolean | undefined>;
}

export interface HttpClient {
    getJson<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    getText(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<string>>;
    postJson<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    request<T>(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<T>>;
    close(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
type ResponseType = "json" | "text";

export function createHttpClient(metadataEndpoints?: Record<string, string | null>): HttpClient {
    const dispatcher = buildProxyDispatcher() ?? new Agent();

    async function call<T>(
        endpointKey: string,
        path: string,
        opts: HttpRequestOptions = {},
        responseType: ResponseType = "json",
    ): Promise<Result<T>> {
        const base = resolveEndpoint(endpointKey, metadataEndpoints?.[endpointKey] ?? null);
        if (!base) {
            return { ok: false, error: { kind: "missing_endpoint", key: endpointKey } };
        }

        const url = buildUrl(base, path, opts.query);
        const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        try {
            const body =
                opts.body === undefined || opts.body === null
                    ? undefined
                    : JSON.stringify(opts.body);
            const headers: Record<string, string> = {
                connection: "close",
                ...(opts.headers ?? {}),
            };
            if (
                body !== undefined &&
                headers["content-type"] === undefined &&
                headers["Content-Type"] === undefined
            ) {
                headers["content-type"] = "application/json";
            }

            const res = await request(url, {
                method: opts.method ?? "GET",
                headers,
                signal: controller.signal,
                ...(body !== undefined ? { body } : {}),
                dispatcher,
            });

            const text = await readBodyWithLimit(res);
            if (responseType === "text") {
                if (res.statusCode >= 400) {
                    return {
                        ok: false,
                        error: { kind: "http", status: res.statusCode, body: text },
                    };
                }
                return { ok: true, value: text as T };
            }

            let data: unknown = null;
            if (text.length > 0) {
                try {
                    data = JSON.parse(text);
                } catch {
                    return {
                        ok: false,
                        error: { kind: "invalid_json", status: res.statusCode, raw: text },
                    };
                }
            }

            if (res.statusCode >= 400) {
                return {
                    ok: false,
                    error: { kind: "http", status: res.statusCode, body: data },
                };
            }

            return { ok: true, value: data as T };
        } catch (err) {
            const errName = (err as { name?: string }).name;
            if (errName === "AbortError" || errName === "TimeoutError") {
                return { ok: false, error: { kind: "timeout", timeoutMs } };
            }
            return {
                ok: false,
                error: {
                    kind: "network",
                    message: err instanceof Error ? err.message : String(err),
                },
            };
        } finally {
            clearTimeout(timer);
        }
    }

    return {
        getJson: <T>(k: string, p: string, o?: HttpRequestOptions) =>
            call<T>(k, p, { ...o, method: "GET" }, "json"),
        getText: (k: string, p: string, o?: HttpRequestOptions) =>
            call<string>(k, p, { ...o, method: "GET" }, "text"),
        postJson: <T>(k: string, p: string, o?: HttpRequestOptions) =>
            call<T>(k, p, { ...o, method: "POST" }, "json"),
        request: <T>(k: string, p: string, o?: HttpRequestOptions) => call<T>(k, p, o, "json"),
        close: () => dispatcher.destroy(),
    };
}

function buildUrl(base: string, path: string, query?: HttpRequestOptions["query"]): string {
    const baseTrimmed = base.endsWith("/") ? base.slice(0, -1) : base;
    const pathNorm = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(baseTrimmed + pathNorm);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`Unsupported URL protocol: ${url.protocol}`);
    }
    if (query) {
        for (const [k, v] of Object.entries(query)) {
            if (v !== undefined) url.searchParams.set(k, String(v));
        }
    }
    return url.toString();
}

function buildProxyDispatcher(): Dispatcher | undefined {
    const raw = process.env["OMNI_PLUGIN_PROXY"];
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as { url?: unknown };
        if (typeof parsed.url === "string" && parsed.url.length > 0) {
            return new ProxyAgent(parsed.url);
        }
    } catch {
        throw new Error(`Invalid OMNI_PLUGIN_PROXY: failed to parse proxy configuration`);
    }
    throw new Error(`Invalid OMNI_PLUGIN_PROXY: missing or empty "url" field`);
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

async function readBodyWithLimit(res: Dispatcher.ResponseData): Promise<string> {
    const rawContentLength = res.headers["content-length"];
    const contentLengthValue = Array.isArray(rawContentLength)
        ? rawContentLength[0]
        : rawContentLength;
    const contentLength = parseInt(contentLengthValue ?? "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
        throw new Error(`Response body too large: ${String(contentLength)} bytes`);
    }
    const text = await res.body.text();
    if (text.length > MAX_BODY_SIZE) {
        throw new Error(`Response body too large: ${String(text.length)} bytes`);
    }
    return text;
}
