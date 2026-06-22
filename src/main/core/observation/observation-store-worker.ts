import { parentPort } from "node:worker_threads";
import { create_observation_store, type ObservationStore } from "./observation-store";
import type { Observation } from "../../../shared/types/observation";

interface WorkerInitMessage {
    readonly type: "init";
    readonly db_path: string;
}

interface WorkerInsertMessage {
    readonly type: "insert";
    readonly id: string;
    readonly obs: Observation;
}

interface WorkerGetLatestMessage {
    readonly type: "get_latest";
    readonly id: string;
    readonly provider: string;
    readonly account_id: string;
    readonly metric_id: string;
    readonly source_instance_id: string;
}

interface WorkerListLatestByProviderMessage {
    readonly type: "list_latest_by_provider";
    readonly id: string;
    readonly provider: string;
}

interface WorkerListAllProvidersMessage {
    readonly type: "list_all_providers";
    readonly id: string;
}

interface WorkerListBySourceInstanceIdMessage {
    readonly type: "list_by_source_instance_id";
    readonly id: string;
    readonly source_instance_id: string;
}

interface WorkerPruneMessage {
    readonly type: "prune";
    readonly id: string;
    readonly older_than_ms: number;
}

interface WorkerCloseMessage {
    readonly type: "close";
    readonly id: string;
}

type WorkerMessage =
    | WorkerInitMessage
    | WorkerInsertMessage
    | WorkerGetLatestMessage
    | WorkerListLatestByProviderMessage
    | WorkerListAllProvidersMessage
    | WorkerListBySourceInstanceIdMessage
    | WorkerPruneMessage
    | WorkerCloseMessage;

interface WorkerResult {
    readonly id: string;
    readonly result?: unknown;
    readonly error?: string;
}

let store: ObservationStore | null = null;
const port: NonNullable<typeof parentPort> = parentPort;

port.on("message", (msg: WorkerMessage) => {
    try {
        switch (msg.type) {
            case "init": {
                store = create_observation_store(msg.db_path);
                port.postMessage({ id: "", result: "ok" } satisfies WorkerResult);
                break;
            }
            case "insert": {
                assert_store(store);
                store.insert(msg.obs);
                port.postMessage({ id: msg.id, result: undefined } satisfies WorkerResult);
                break;
            }
            case "get_latest": {
                assert_store(store);
                const result = store.get_latest(
                    msg.provider,
                    msg.account_id,
                    msg.metric_id,
                    msg.source_instance_id,
                );
                port.postMessage({ id: msg.id, result } satisfies WorkerResult);
                break;
            }
            case "list_latest_by_provider": {
                assert_store(store);
                const result = store.list_latest_by_provider(msg.provider);
                port.postMessage({ id: msg.id, result } satisfies WorkerResult);
                break;
            }
            case "list_all_providers": {
                assert_store(store);
                const result = store.list_all_providers();
                port.postMessage({ id: msg.id, result } satisfies WorkerResult);
                break;
            }
            case "list_by_source_instance_id": {
                assert_store(store);
                const result = store.list_by_source_instance_id(msg.source_instance_id);
                port.postMessage({ id: msg.id, result } satisfies WorkerResult);
                break;
            }
            case "prune": {
                assert_store(store);
                const result = store.prune(msg.older_than_ms);
                port.postMessage({ id: msg.id, result } satisfies WorkerResult);
                break;
            }
            case "close": {
                assert_store(store);
                store.close();
                store = null;
                port.postMessage({ id: msg.id, result: undefined } satisfies WorkerResult);
                break;
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if ("id" in msg) {
            port.postMessage({ id: msg.id, error: message } satisfies WorkerResult);
        }
    }
});

function assert_store(s: ObservationStore | null): asserts s is ObservationStore {
    if (s === null) throw new Error("ObservationStore worker not initialized");
}
