import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { IpcResult } from "../../ipc/helpers";

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export class RequestBodyTooLargeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RequestBodyTooLargeError";
    }
}

export class InvalidParamError extends Error {
    constructor(param: string) {
        super(`Invalid parameter: ${param}`);
        this.name = "InvalidParamError";
    }
}

export function parse_body(req: IncomingMessage): Promise<Buffer> {
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
                req.resume();
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

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false };

// A17 / AC-002: 过滤 __proto__, constructor, prototype 避免原型链污染
export function safe_json_reviver(key: string, value: unknown): unknown {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return undefined;
    }
    return value;
}

export function json_response(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
}

export async function read_json_body(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<JsonBodyResult> {
    try {
        return {
            ok: true,
            value: JSON.parse((await parse_body(req)).toString("utf8"), safe_json_reviver),
        };
    } catch (err) {
        if (err instanceof RequestBodyTooLargeError) {
            json_response(res, 413, { error: "Request body too large" });
        } else {
            json_response(res, 400, { error: "Invalid JSON" });
        }
        return { ok: false };
    }
}

export function send_result<T>(res: ServerResponse, result: IpcResult<T>): void {
    if (result.ok) {
        json_response(res, 200, result.data ?? {});
    } else {
        json_response(res, 400, result.error);
    }
}

export function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parse_int_param(
    params: URLSearchParams,
    name: string,
    options?: { min?: number; require_present?: boolean },
): number | null {
    const raw = params.get(name);
    if (raw === null) {
        if (options?.require_present) throw new InvalidParamError(name);
        return null;
    }
    if (raw.trim() === "") {
        throw new InvalidParamError(name);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new InvalidParamError(name);
    }
    if (options?.min !== undefined && value < options.min) {
        throw new InvalidParamError(name);
    }
    return value;
}

export function is_within_web_root(web_root: string, resolved: string): boolean {
    const rel = path.relative(web_root, resolved);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
