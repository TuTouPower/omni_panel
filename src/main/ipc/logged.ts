import type { IpcResult } from "./helpers";

export interface LoggedOptions {
    redactArgs?: (args: unknown[]) => unknown[];
    redactResult?: (result: unknown) => unknown;
}

export function createLoggedIpcHandler(
    log: {
        debug: (msg: string, ...args: unknown[]) => void;
        warn: (msg: string, ...args: unknown[]) => void;
    },
    options?: LoggedOptions,
) {
    return async function logged<T>(
        channel: string,
        args: unknown[],
        fn: () => Promise<IpcResult<T>>,
    ): Promise<IpcResult<T>> {
        const start = Date.now();
        const is_development = process.env["NODE_ENV"] === "development";
        if (is_development)
            log.debug("ipc request raw", {
                channel,
                args: options?.redactArgs ? options.redactArgs(args) : args,
            });
        log.debug(`${channel} called`);
        try {
            const result = await fn();
            if (is_development)
                log.debug("ipc response raw", {
                    channel,
                    result: options?.redactResult ? options.redactResult(result) : result,
                });
            const elapsed = Date.now() - start;
            if (!result.ok) {
                log.warn(`${channel} failed: ${result.error.code} (${String(elapsed)}ms)`);
            } else {
                log.debug(`${channel} ok (${String(elapsed)}ms)`);
            }
            return result;
        } catch (error: unknown) {
            if (is_development) log.debug("ipc error raw", { channel, error });
            throw error;
        }
    };
}
