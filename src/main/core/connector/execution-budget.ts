import { DEFAULT_EXECUTION_BUDGET_MS, MAX_HOST_CONCURRENCY } from "../../../shared/constants";

export { DEFAULT_EXECUTION_BUDGET_MS, MAX_HOST_CONCURRENCY };

export const HARD_WATCHDOG_GRACE_MS = 1_500;

export class BudgetExhaustedError extends Error {
    readonly code = "BUDGET_EXHAUSTED" as const;
    readonly non_retryable = true;
    constructor(message = "Connector execution budget exhausted") {
        super(message);
        this.name = "BudgetExhaustedError";
    }
}

export class TerminatedError extends Error {
    readonly code = "TERMINATED" as const;
    readonly non_retryable = true;
    constructor(message = "Connector worker process terminated by host watchdog") {
        super(message);
        this.name = "TerminatedError";
    }
}

export interface ExecutionBudget {
    readonly total_ms: number;
    readonly deadline_ms: number;
    readonly remaining_ms: () => number;
    readonly is_exhausted: () => boolean;
}

export function create_execution_budget(
    total_ms: number = DEFAULT_EXECUTION_BUDGET_MS,
    start_time: number = Date.now(),
): ExecutionBudget {
    const effective_total =
        Number.isFinite(total_ms) && total_ms > 0 ? total_ms : DEFAULT_EXECUTION_BUDGET_MS;
    const deadline_ms = start_time + effective_total;
    return {
        total_ms: effective_total,
        deadline_ms,
        remaining_ms: () => Math.max(0, deadline_ms - Date.now()),
        is_exhausted: () => Date.now() >= deadline_ms,
    };
}

export function create_execution_budget_from_deadline(
    deadline_ms: number,
    total_ms?: number,
): ExecutionBudget {
    const now = Date.now();
    const effective_total =
        total_ms !== undefined && Number.isFinite(total_ms) && total_ms > 0
            ? total_ms
            : Math.max(1, deadline_ms - now);
    return {
        total_ms: effective_total,
        deadline_ms,
        remaining_ms: () => Math.max(0, deadline_ms - Date.now()),
        is_exhausted: () => Date.now() >= deadline_ms,
    };
}

export class HostConcurrencyLimiter {
    private active = 0;
    private readonly queue: (() => void)[] = [];

    constructor(readonly max_concurrency: number = MAX_HOST_CONCURRENCY) {}

    async acquire(signal?: AbortSignal): Promise<() => void> {
        if (signal?.aborted) {
            throw signal.reason instanceof Error ? signal.reason : new BudgetExhaustedError();
        }

        if (this.active < this.max_concurrency) {
            this.active++;
            let released = false;
            return () => {
                if (released) return;
                released = true;
                this.active--;
                const next = this.queue.shift();
                if (next) next();
            };
        }

        return new Promise<() => void>((resolve, reject) => {
            let on_abort: (() => void) | undefined;
            const resume = () => {
                if (on_abort && signal) {
                    signal.removeEventListener("abort", on_abort);
                }
                this.active++;
                let released = false;
                resolve(() => {
                    if (released) return;
                    released = true;
                    this.active--;
                    const next = this.queue.shift();
                    if (next) next();
                });
            };

            if (signal) {
                on_abort = () => {
                    const idx = this.queue.indexOf(resume);
                    if (idx !== -1) {
                        this.queue.splice(idx, 1);
                    }
                    reject(
                        signal.reason instanceof Error ? signal.reason : new BudgetExhaustedError(),
                    );
                };
                signal.addEventListener("abort", on_abort, { once: true });
            }

            this.queue.push(resume);
        });
    }

    clear(): void {
        this.queue.length = 0;
    }
}

export interface ConcurrentPoolOptions {
    readonly concurrency?: number;
    readonly signal?: AbortSignal;
}

export interface ConnectorPool {
    map<T, R>(
        items: Iterable<T> | readonly T[],
        worker: (item: T, index: number, stop: () => void) => Promise<R>,
        opts?: ConcurrentPoolOptions,
    ): AsyncIterable<R>;
    all<T, R>(
        items: Iterable<T> | readonly T[],
        worker: (item: T, index: number, stop: () => void) => Promise<R>,
        opts?: ConcurrentPoolOptions,
    ): Promise<R[]>;
}

export function create_connector_pool(
    host_signal: AbortSignal,
    host_max_concurrency: number = MAX_HOST_CONCURRENCY,
): ConnectorPool {
    return {
        async *map<T, R>(
            items: Iterable<T> | readonly T[],
            worker: (item: T, index: number, stop: () => void) => Promise<R>,
            opts?: ConcurrentPoolOptions,
        ): AsyncIterable<R> {
            const concurrency_limit = Math.max(
                1,
                Math.min(opts?.concurrency ?? host_max_concurrency, host_max_concurrency),
            );

            const pool_ac = new AbortController();
            const state = { stopped: false };
            const stop = () => {
                state.stopped = true;
                pool_ac.abort(new Error("Pool stopped"));
            };

            if (host_signal.aborted) {
                throw host_signal.reason ?? new BudgetExhaustedError();
            }

            const on_host_abort = () => {
                pool_ac.abort(host_signal.reason ?? new BudgetExhaustedError());
            };
            host_signal.addEventListener("abort", on_host_abort, { once: true });

            let on_opt_abort: (() => void) | undefined;
            if (opts?.signal) {
                if (opts.signal.aborted) {
                    stop();
                } else {
                    on_opt_abort = () => {
                        stop();
                    };
                    opts.signal.addEventListener("abort", on_opt_abort, { once: true });
                }
            }

            const item_array = Array.isArray(items) ? items : Array.from(items);
            let next_idx = 0;
            let running = 0;

            type QueueItem =
                | { type: "data"; value: R }
                | { type: "error"; error: unknown }
                | { type: "done" };

            const completed: QueueItem[] = [];
            let notify_waiter: (() => void) | null = null;

            const push_queue = (qi: QueueItem) => {
                completed.push(qi);
                if (notify_waiter) {
                    const w = notify_waiter;
                    notify_waiter = null;
                    w();
                }
            };

            const launch_next = () => {
                if (state.stopped || pool_ac.signal.aborted || next_idx >= item_array.length) {
                    if (running === 0) {
                        push_queue({ type: "done" });
                    }
                    return;
                }

                const current_idx = next_idx++;
                const item = item_array[current_idx] as T;
                running++;

                void (async () => {
                    try {
                        const result = await worker(item, current_idx, stop);
                        if (!state.stopped) {
                            push_queue({ type: "data", value: result });
                        }
                    } catch (err: unknown) {
                        if (!state.stopped) {
                            push_queue({ type: "error", error: err });
                        }
                    } finally {
                        running--;
                        launch_next();
                    }
                })();
            };

            // Prime the initial batch
            const initial_batch = Math.min(concurrency_limit, item_array.length);
            if (initial_batch === 0) {
                push_queue({ type: "done" });
            } else {
                for (let i = 0; i < initial_batch; i++) {
                    launch_next();
                }
            }

            try {
                for (;;) {
                    if (completed.length === 0) {
                        if ((host_signal as { readonly aborted: boolean }).aborted) {
                            throw host_signal.reason instanceof Error
                                ? host_signal.reason
                                : new BudgetExhaustedError();
                        }
                        await new Promise<void>((r) => {
                            notify_waiter = r;
                        });
                    }

                    while (completed.length > 0) {
                        const next_item = completed.shift();
                        if (!next_item) continue;
                        if (next_item.type === "done") {
                            return;
                        }
                        if (next_item.type === "error") {
                            throw next_item.error;
                        }
                        yield next_item.value;
                    }
                }
            } finally {
                stop();
                host_signal.removeEventListener("abort", on_host_abort);
                if (opts?.signal && on_opt_abort) {
                    opts.signal.removeEventListener("abort", on_opt_abort);
                }
            }
        },

        async all<T, R>(
            items: Iterable<T> | readonly T[],
            worker: (item: T, index: number, stop: () => void) => Promise<R>,
            opts?: ConcurrentPoolOptions,
        ): Promise<R[]> {
            const results: R[] = [];
            for await (const res of this.map(items, worker, opts)) {
                results.push(res);
            }
            return results;
        },
    };
}
