import { useState, useEffect, useCallback } from "react";
import type { PluginInfo, PluginSnapshotDTO } from "../../shared/types/ipc";

interface UsePluginsResult {
    plugins: PluginInfo[];
    loading: boolean;
    error: string | null;
    refresh: (instanceId: string) => Promise<void>;
    refreshAll: () => Promise<void>;
}

export function usePlugins(): UsePluginsResult {
    const [plugins, setPlugins] = useState<PluginInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        window.usageboard.plugin
            .list()
            .then((list) => {
                if (!cancelled) {
                    setPlugins(list);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "加载插件失败");
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const unsub = window.usageboard.event.onStateChange(
            (instanceId: string, state: PluginSnapshotDTO) => {
                setPlugins((prev) =>
                    prev.map((p) => (p.instanceId === instanceId ? { ...p, snapshot: state } : p)),
                );
            },
        );
        return unsub;
    }, []);

    const refresh = useCallback(async (instanceId: string) => {
        await window.usageboard.plugin.refresh(instanceId);
    }, []);

    const refreshAllFn = useCallback(async () => {
        await window.usageboard.plugin.refreshAll();
    }, []);

    return { plugins, loading, error, refresh, refreshAll: refreshAllFn };
}
