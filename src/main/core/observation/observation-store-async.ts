import { Worker } from "node:worker_threads";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../../../shared/lib/logger";
import type { Observation } from "../../../shared/types/observation";

const log = createLogger("observation-store-async");

export interface AsyncObservationStore {
    insert(obs: Observation): Promise<void>;
    get_latest(
        provider: string,
        account_id: string,
        metric_id: string,
        source_instance_id: string,
    ): Promise<Observation | null>;
    list_latest_by_provider(provider: string): Promise<Observation[]>;
    list_all_providers(): Promise<string[]>;
    list_by_source_instance_id(source_instance_id: string): Promise<Observation[]>;
    prune(older_than_ms: number): Promise<number>;
    close(): Promise<void>;
}

interface PendingRequest {
    readonly resolve: (value: unknown) => void;
    readonly reject: (reason: unknown) => void;
}

export function create_async_observation_store(db_path: string): AsyncObservationStore {
    const worker_script = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "observation-store-worker.ts",
    );
    const worker = new Worker(worker_script, { type: "module" });

    let request_counter = 0;
    const pending = new Map<string, PendingRequest>();

    function next_id(): string {
        return String(++request_counter);
    }

    function post_and_wait<T>(msg: Record<string, unknown>): Promise<T> {
        const id = next_id();
        return new Promise<T>((resolve, reject) => {
            pending.set(id, {
                resolve: (value: unknown) => {
                    resolve(value as T);
                },
                reject,
            });
            worker.postMessage({ ...msg, id });
        });
    }

    worker.on(
        "message",
        (msg: { readonly id: string; readonly result?: unknown; readonly error?: string }) => {
            const req = pending.get(msg.id);
            if (req === undefined) {
                log.error(`No pending request for worker message id=${msg.id}`);
                return;
            }
            pending.delete(msg.id);
            if (msg.error !== undefined) {
                req.reject(new Error(msg.error));
            } else {
                req.resolve(msg.result);
            }
        },
    );

    worker.on("error", (err: Error) => {
        log.error(`Observation store worker error: ${err.message}`);
    });

    // Initialize the store inside the worker
    const ready = new Promise<void>((resolve, reject) => {
        const handler = (msg: {
            readonly id: string;
            readonly result?: unknown;
            readonly error?: string;
        }) => {
            if (msg.id === "") {
                worker.off("message", handler);
                if (msg.error !== undefined) {
                    reject(new Error(msg.error));
                } else {
                    resolve();
                }
            }
        };
        worker.on("message", handler);
        worker.postMessage({ type: "init", db_path });
    });

    const store: AsyncObservationStore = {
        async insert(obs: Observation): Promise<void> {
            await ready;
            await post_and_wait<undefined>({ type: "insert", obs });
        },

        async get_latest(
            provider: string,
            account_id: string,
            metric_id: string,
            source_instance_id: string,
        ): Promise<Observation | null> {
            await ready;
            return post_and_wait<Observation | null>({
                type: "get_latest",
                provider,
                account_id,
                metric_id,
                source_instance_id,
            });
        },

        async list_latest_by_provider(provider: string): Promise<Observation[]> {
            await ready;
            return post_and_wait<Observation[]>({
                type: "list_latest_by_provider",
                provider,
            });
        },

        async list_all_providers(): Promise<string[]> {
            await ready;
            return post_and_wait<string[]>({ type: "list_all_providers" });
        },

        async list_by_source_instance_id(source_instance_id: string): Promise<Observation[]> {
            await ready;
            return post_and_wait<Observation[]>({
                type: "list_by_source_instance_id",
                source_instance_id,
            });
        },

        async prune(older_than_ms: number): Promise<number> {
            await ready;
            return post_and_wait<number>({ type: "prune", older_than_ms });
        },

        async close(): Promise<void> {
            await ready;
            await post_and_wait<undefined>({ type: "close" });
            await worker.terminate();
        },
    };

    return store;
}
