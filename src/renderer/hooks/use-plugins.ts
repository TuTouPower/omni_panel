/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useEffect, useCallback } from "react";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../shared/types/ipc";

const MODULE = "use-plugins";

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
            setPlugins(list);
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
        const unsub = window.usageboard.event.onStateChange(
            (instanceId: string, state: ConnectorSnapshotDTO) => {
                setPlugins((prev) =>
                    prev.map((p) => (p.instanceId === instanceId ? { ...p, snapshot: state } : p)),
                );
            },
        );
        return unsub;
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
