import type { ConnectorSnapshotState, RuntimeStoreListener } from "./types";
import { createLogger } from "../../../shared/lib/logger";
import { createSnapshotCache, type SnapshotCache } from "./snapshot-cache";

const log = createLogger("runtime-store");

export interface RuntimeStore {
    getSnapshot(instanceId: string): ConnectorSnapshotState;
    updateState(instanceId: string, state: ConnectorSnapshotState): void;
    getAll(): ReadonlyMap<string, ConnectorSnapshotState>;
    subscribe(listener: RuntimeStoreListener): () => void;
    removeInstance(instanceId: string): void;
    /** Pre-populate from disk cache. Resolves when done. */
    hydrateFromCache(): Promise<void>;
    /** Flush any pending debounced snapshot cache write. */
    flushPendingCache(): Promise<void>;
}

export function createRuntimeStore(persistPath?: string): RuntimeStore {
    const states = new Map<string, ConnectorSnapshotState>();
    const listeners = new Set<RuntimeStoreListener>();

    let cache: SnapshotCache | null = null;
    let persistTimer: ReturnType<typeof setTimeout> | null = null;

    if (persistPath) {
        cache = createSnapshotCache(persistPath);
    }

    function schedulePersist(): void {
        if (!cache) return;
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            persistTimer = null;
            void cache.save(states).catch((err: unknown) => {
                log.warn("Failed to persist snapshot cache", err);
            });
        }, 500);
    }

    return {
        getSnapshot(instanceId: string): ConnectorSnapshotState {
            return states.get(instanceId) ?? { status: "idle" };
        },

        updateState(instanceId: string, state: ConnectorSnapshotState): void {
            states.set(instanceId, state);
            schedulePersist();
            for (const listener of listeners) {
                listener.onStateChange(instanceId, state);
            }
        },

        getAll(): ReadonlyMap<string, ConnectorSnapshotState> {
            return new Map(states);
        },

        subscribe(listener: RuntimeStoreListener): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        removeInstance(instanceId: string): void {
            const existed = states.delete(instanceId);
            if (existed) schedulePersist();
        },

        async hydrateFromCache(): Promise<void> {
            if (!cache) return;
            const cached = await cache.load();
            for (const [id, state] of cached) {
                if (!states.has(id)) {
                    states.set(id, state);
                }
            }
            if (cached.size > 0) {
                log.info(`Hydrated ${String(cached.size)} snapshot(s) from cache`);
            }
        },

        async flushPendingCache(): Promise<void> {
            if (persistTimer) {
                clearTimeout(persistTimer);
                persistTimer = null;
                await cache?.save(states);
            }
        },
    };
}
