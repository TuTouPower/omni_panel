import { createServer, type IncomingMessage } from "node:http";

export interface HttpStubRoute {
    readonly path: string | RegExp;
    readonly status?: number;
    readonly body?: unknown;
    readonly delayMs?: number;
}

export interface HttpStubHandle {
    readonly baseUrl: string;
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

function match_route(path: string | undefined, routes: HttpStubRoute[]): HttpStubRoute | undefined {
    if (path === undefined) return undefined;
    const pathname = path.split("?")[0] ?? path;
    return routes.find((route) => {
        if (typeof route.path === "string") return pathname === route.path;
        return route.path.test(pathname);
    });
}

export async function withHttpStub<T>(
    routes: HttpStubRoute[],
    fn: (handle: HttpStubHandle) => Promise<T>,
): Promise<T> {
    const requests: RecordedRequest[] = [];

    const server = createServer((req, res) => {
        void (async () => {
            const url = req.url ?? "/";
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === "string") {
                    headers[key] = value;
                } else if (Array.isArray(value)) {
                    headers[key] = value.join(", ");
                }
            }

            const body = await read_request_body(req);
            requests.push({
                method: req.method ?? "GET",
                url,
                headers,
                body,
            });

            const route = match_route(url, routes);
            const status = route?.status ?? (route ? 200 : 404);
            const response_body = route?.body ?? { error: `no route for ${url}` };
            const delay = route?.delayMs ?? 0;

            const send = () => {
                res.writeHead(status, { "Content-Type": "application/json" });
                res.end(JSON.stringify(response_body));
            };

            if (delay > 0) {
                setTimeout(send, delay);
            } else {
                send();
            }
        })();
    });

    await new Promise<void>((resolve_listen) => {
        server.listen(0, "127.0.0.1", resolve_listen);
    });
    const addr = server.address() as { port: number };
    const base_url = `http://127.0.0.1:${String(addr.port)}`;

    const close = () =>
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
        return await fn({ baseUrl: base_url, requests, close });
    } finally {
        await close();
    }
}
