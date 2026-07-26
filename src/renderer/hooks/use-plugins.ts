/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useEffect, useCallback } from "react";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../shared/types/ipc";

const MODULE = "use-plugins";

function snapshot_equal(a: ConnectorSnapshotDTO, b: ConnectorSnapshotDTO): boolean {
    if (a === b) return true;
    return JSON.stringify(a) === JSON.stringify(b);
}

function plugin_list_equal(a: ConnectorInfo[], b: ConnectorInfo[]): boolean {
    if (a === b) return true;
    return JSON.stringify(a) === JSON.stringify(b);
}

interface UsePluginsResult {
    plugins: ConnectorInfo[];
    loading: boolean;
    error: string | null;
    refresh: (instanceId: string) => Promise<void>;
    refreshAll: () => Promise<void>;
    reload: () => Promise<void>;
}

export function use_plugins(): UsePluginsResult {
    const [plugins, setPlugins] = useState<ConnectorInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        window.usageboard.log({
            level: "debug",
            module: MODULE,
            message: "Reloading plugin list",
        });
        try {
            const list = await window.usageboard.connector.list();
            window.usageboard.log({
                level: "info",
                module: MODULE,
                message: `Loaded ${String(list.length)} plugins`,
            });
            // t153: connector:list always returns a fresh array. Keep the
            // previous reference when the list is value-equal so a reload
            // triggered by a config broadcast does not re-render the panel.
            setPlugins((prev) => (plugin_list_equal(prev, list) ? prev : list));
            setError(null);
            setLoading(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "加载连接器失败";
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `Failed to load plugins: ${message}`,
            });
            setError(message);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    useEffect(() => {
        const pending = new Map<string, ConnectorSnapshotDTO>();
        let raf_handle: number | undefined;

        const flush = () => {
            if (pending.size === 0) return;
            const states = new Map(pending);
            pending.clear();
            setPlugins((prev) => {
                const next = prev.map((p) => {
                    const state = states.get(p.instanceId);
                    if (state === undefined) return p;
                    if (p.snapshot === state) return p;
                    if (snapshot_equal(p.snapshot, state)) return p;
                    return { ...p, snapshot: state };
                });
                return next.every((p, index) => p === prev[index]) ? prev : next;
            });
        };

        const schedule = () => {
            if (raf_handle !== undefined) return;
            if (typeof requestAnimationFrame === "undefined") {
                flush();
                return;
            }
            raf_handle = requestAnimationFrame(() => {
                raf_handle = undefined;
                flush();
            });
        };

        const unsub = window.usageboard.event.onStateChange(
            (instanceId: string, state: ConnectorSnapshotDTO) => {
                pending.set(instanceId, state);
                schedule();
            },
        );

        return () => {
            unsub();
            if (raf_handle !== undefined) {
                cancelAnimationFrame(raf_handle);
                raf_handle = undefined;
            }
            pending.clear();
        };
    }, []);

    const refresh = useCallback(async (instanceId: string) => {
        window.usageboard.log({
            level: "debug",
            module: MODULE,
            message: `Refreshing plugin ${instanceId}`,
        });
        await window.usageboard.connector.refresh(instanceId);
    }, []);

    const refreshAllFn = useCallback(async () => {
        window.usageboard.log({
            level: "debug",
            module: MODULE,
            message: "Refreshing all plugins",
        });
        await window.usageboard.connector.refreshAll();
    }, []);

    return { plugins, loading, error, refresh, refreshAll: refreshAllFn, reload };
}
