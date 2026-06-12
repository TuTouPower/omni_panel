import { createServer, type Server } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { rmSync } from "node:fs";
import { createGzip } from "node:zlib";
import { generateSelfSignedCert } from "./test_certs";

export interface HttpsStubRoute {
    readonly path: string | RegExp;
    readonly status?: number;
    readonly body?: unknown;
    readonly delayMs?: number;
}

export interface HttpsStubOptions {
    readonly routes: readonly HttpsStubRoute[];
    readonly gzip?: boolean;
    readonly redirect?: {
        readonly from: string;
        readonly to: string;
        readonly status: 301 | 302 | 307;
    };
    readonly errorStatus?: number;
    readonly errorBody?: string;
}

export interface HttpsStubHandle {
    readonly baseUrl: string;
    readonly certPath: string;
    readonly requests: RecordedRequest[];
    close(): Promise<void>;
}

export interface RecordedRequest {
    readonly method: string;
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
}

function read_request_body(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve_body, reject_body) => {
        const chunks: Buffer[] = [];
        req.on("error", (err: unknown) => {
            reject_body(err instanceof Error ? err : new Error(String(err)));
        });
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw) {
                resolve_body(null);
                return;
            }
            try {
                resolve_body(JSON.parse(raw) as unknown);
            } catch {
                resolve_body(raw);
            }
        });
    });
}

function match_route(path: string, routes: readonly HttpsStubRoute[]): HttpsStubRoute | undefined {
    const pathname = path.split("?")[0] ?? path;
    return routes.find((route) => {
        if (typeof route.path === "string") return pathname === route.path;
        return route.path.test(pathname);
    });
}

function write_response(
    res: ServerResponse,
    status: number,
    headers: Record<string, string>,
    body: string,
    gzip: boolean,
): void {
    if (gzip) {
        res.writeHead(status, { ...headers, "content-encoding": "gzip" });
        const gz = createGzip();
        gz.pipe(res);
        gz.end(body);
    } else {
        res.writeHead(status, headers);
        res.end(body);
    }
}

export async function withHttpsStub<T>(
    options: HttpsStubOptions,
    fn: (handle: HttpsStubHandle) => Promise<T>,
): Promise<T> {
    const { key, cert, certPath, tempDir } = generateSelfSignedCert();
    const requests: RecordedRequest[] = [];
    const gzip = options.gzip ?? false;

    const server: Server = createServer({ key, cert }, (req, res) => {
        void (async () => {
            const url = req.url ?? "/";
            const headers: Record<string, string> = {};
            for (const [hkey, value] of Object.entries(req.headers)) {
                if (typeof value === "string") {
                    headers[hkey] = value;
                } else if (Array.isArray(value)) {
                    headers[hkey] = value.join(", ");
                }
            }

            const body = await read_request_body(req);
            requests.push({ method: req.method ?? "GET", url, headers, body });

            // Redirect (checked before errorStatus)
            const pathname = url.split("?")[0] ?? url;
            if (pathname === options.redirect?.from) {
                res.writeHead(options.redirect.status, { Location: options.redirect.to });
                res.end();
                return;
            }

            // Error status (global)
            if (options.errorStatus !== undefined) {
                write_response(
                    res,
                    options.errorStatus,
                    { "Content-Type": "text/html" },
                    options.errorBody ?? "<h1>Internal Server Error</h1>",
                    gzip,
                );
                return;
            }

            // Route matching
            const route = match_route(url, options.routes);
            const status = route?.status ?? (route ? 200 : 404);
            const responseBody = route?.body ?? { error: `no route for ${url}` };
            const delay = route?.delayMs ?? 0;

            const send = () => {
                write_response(
                    res,
                    status,
                    { "Content-Type": "application/json" },
                    JSON.stringify(responseBody),
                    gzip,
                );
            };

            if (delay > 0) {
                setTimeout(send, delay);
            } else {
                send();
            }
        })();
    });

    await new Promise<void>((resolve_listen) => {
        server.listen(0, "127.0.0.1", () => {
            resolve_listen();
        });
    });

    const addr = server.address() as { port: number };
    const baseUrl = `https://127.0.0.1:${String(addr.port)}`;

    const close = (): Promise<void> =>
        new Promise<void>((resolve_close, reject_close) => {
            server.close((err) => {
                if (err) {
                    reject_close(err);
                    return;
                }
                resolve_close();
            });
        });

    try {
        return await fn({ baseUrl, certPath, requests, close });
    } finally {
        await close();
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {
            /* ignore cleanup failure */
        }
    }
}
