import type { PluginSnapshotState, RuntimeStoreListener } from "./types";

export interface RuntimeStore {
    getSnapshot(instanceId: string): PluginSnapshotState;
    updateState(instanceId: string, state: PluginSnapshotState): void;
    getAll(): ReadonlyMap<string, PluginSnapshotState>;
    subscribe(listener: RuntimeStoreListener): () => void;
    removeInstance(instanceId: string): void;
}

export function createRuntimeStore(): RuntimeStore {
    const states = new Map<string, PluginSnapshotState>();
    const listeners = new Set<RuntimeStoreListener>();

    return {
        getSnapshot(instanceId: string): PluginSnapshotState {
            return states.get(instanceId) ?? { status: "idle" };
        },

        updateState(instanceId: string, state: PluginSnapshotState): void {
            states.set(instanceId, state);
            for (const listener of listeners) {
                listener.onStateChange(instanceId, state);
            }
        },

        getAll(): ReadonlyMap<string, PluginSnapshotState> {
            return states;
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
