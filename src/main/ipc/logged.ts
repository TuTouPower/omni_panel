import { createTraceId } from "../../shared/lib/logger";
import type { IpcResult } from "./helpers";

export interface LoggedOptions {
    redactArgs?: (args: unknown[]) => unknown[];
    redactResult?: (result: unknown) => unknown;
}

export function createLoggedIpcHandler(
    log: {
        debug: (msg: string, meta?: unknown) => void;
        warn: (msg: string, meta?: unknown) => void;
    },
    options?: LoggedOptions,
) {
    return async function logged<T>(
        channel: string,
        args: unknown[],
        fn: () => Promise<IpcResult<T>>,
    ): Promise<IpcResult<T>> {
        const start = Date.now();
        const trace_id = createTraceId("ipc");
        const trace_meta = { trace_id };
        const merge_trace_meta = (meta: unknown): unknown => {
            if (meta instanceof Error || meta instanceof Date)
                return { ...trace_meta, value: meta };
            if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
                return { ...trace_meta, ...(meta as Record<string, unknown>) };
            }
            if (meta === undefined) return trace_meta;
            return { ...trace_meta, value: meta };
        };
        const trace_log = {
            debug: (msg: string, meta?: unknown) => {
                log.debug(msg, merge_trace_meta(meta));
            },
            warn: (msg: string, meta?: unknown) => {
                log.warn(msg, merge_trace_meta(meta));
            },
        };
        const is_development = process.env["NODE_ENV"] === "development";
        if (is_development)
            trace_log.debug("ipc request raw", {
                channel,
                args: options?.redactArgs ? options.redactArgs(args) : args,
            });
        trace_log.debug(`${channel} called`);
        try {
            const result = await fn();
            if (is_development)
                trace_log.debug("ipc response raw", {
                    channel,
                    result: options?.redactResult ? options.redactResult(result) : result,
                });
            const elapsed = Date.now() - start;
            if (!result.ok) {
                trace_log.warn(`${channel} failed: ${result.error.code} (${String(elapsed)}ms)`);
            } else {
                trace_log.debug(`${channel} ok (${String(elapsed)}ms)`);
            }
            return result;
        } catch (error: unknown) {
            if (is_development) trace_log.debug("ipc error raw", { channel, error });
            throw error;
        }
    };
}
