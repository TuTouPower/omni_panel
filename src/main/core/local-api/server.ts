import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createLogger } from "../../../shared/lib/logger";
import { observation_ingest_schema } from "../../../shared/schemas/observation";
import type { Observation } from "../../../shared/types/observation";
import type { ObservationStore } from "../observation/observation-store";

const log = createLogger("local-api");
const DEFAULT_PORT = 17863;
const MAX_BODY_BYTES = 1024 * 1024;

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
    options?: { port?: number },
): LocalAPIServer {
    const token = generate_token();
    let port = options?.port ?? DEFAULT_PORT;
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
            if (req.url === "/v1/health" && req.method === "GET") {
                json_response(res, 200, { status: "ok", uptime: process.uptime() });
                return;
            }

            if (!check_auth(req, token)) {
                json_response(res, 401, { error: "Unauthorized" });
                return;
            }

            if (req.url === "/v1/ingest" && req.method === "POST") {
                await handle_ingest(req, res);
                return;
            }

            json_response(res, 404, { error: "Not found" });
        })().catch((err: unknown) => {
            log.error("request failed", err);
            json_response(res, 500, { error: "Internal server error" });
        });
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
            active_server.listen(target_port, "127.0.0.1");
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
            log.info(`LocalAPI listening on 127.0.0.1:${String(port)}`);
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

        get_token() {
            return token;
        },
    };
}
