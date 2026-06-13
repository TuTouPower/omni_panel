import type { ConnectorSnapshotState, RuntimeStoreListener } from "./types";

export interface RuntimeStore {
    getSnapshot(instanceId: string): ConnectorSnapshotState;
    updateState(instanceId: string, state: ConnectorSnapshotState): void;
    getAll(): ReadonlyMap<string, ConnectorSnapshotState>;
    subscribe(listener: RuntimeStoreListener): () => void;
    removeInstance(instanceId: string): void;
}

export function createRuntimeStore(): RuntimeStore {
    const states = new Map<string, ConnectorSnapshotState>();
    const listeners = new Set<RuntimeStoreListener>();

    return {
        getSnapshot(instanceId: string): ConnectorSnapshotState {
            return states.get(instanceId) ?? { status: "idle" };
        },

        updateState(instanceId: string, state: ConnectorSnapshotState): void {
            states.set(instanceId, state);
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
            states.delete(instanceId);
        },
    };
}
