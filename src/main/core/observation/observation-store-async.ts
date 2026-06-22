import { createLogger } from "../../../shared/lib/logger";
import type { Observation } from "../../../shared/types/observation";
import type { ObservationStore } from "./observation-store";
import { create_observation_store } from "./observation-store";

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

export function create_async_observation_store(db_path: string): AsyncObservationStore {
    log.info(`Creating observation store (sync): ${db_path}`);
    const store = create_observation_store(db_path);
    return wrap_sync_as_async(store);
}

export function wrap_sync_as_async(sync: ObservationStore): AsyncObservationStore {
    return {
        insert(obs: Observation): Promise<void> {
            sync.insert(obs);
            return Promise.resolve();
        },
        get_latest(
            provider: string,
            account_id: string,
            metric_id: string,
            source_instance_id: string,
        ): Promise<Observation | null> {
            return Promise.resolve(
                sync.get_latest(provider, account_id, metric_id, source_instance_id),
            );
        },
        list_latest_by_provider(provider: string): Promise<Observation[]> {
            return Promise.resolve(sync.list_latest_by_provider(provider));
        },
        list_all_providers(): Promise<string[]> {
            return Promise.resolve(sync.list_all_providers());
        },
        list_by_source_instance_id(source_instance_id: string): Promise<Observation[]> {
            return Promise.resolve(sync.list_by_source_instance_id(source_instance_id));
        },
        prune(older_than_ms: number): Promise<number> {
            return Promise.resolve(sync.prune(older_than_ms));
        },
        close(): Promise<void> {
            sync.close();
            return Promise.resolve();
        },
    };
}
