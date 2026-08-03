/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useEffect, useCallback } from "react";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../shared/types/ipc";
import type { PluginMetadata } from "../../shared/schemas/plugin-metadata";

const MODULE = "use-plugins";

// t196 AC4: 深比较不再对整份快照/插件列表 JSON.stringify。结构性字段
// （items/error/badge）按浅引用，chart/updatedAt 等标量字段按值比较——
// state 无变化时不触发重渲染，等价但避免序列化整棵树。
function snapshot_equal(a: ConnectorSnapshotDTO, b: ConnectorSnapshotDTO): boolean {
    if (a === b) return true;
    if (a.status !== b.status) return false;
    switch (a.status) {
        case "idle":
            return true;
        case "loading":
            return (
                b.status === "loading" &&
                a.updatedAt === b.updatedAt &&
                a.items === b.items &&
                a.badge === b.badge &&
                a.chart === b.chart
            );
        case "ready":
            return (
                b.status === "ready" &&
                a.items === b.items &&
                a.updatedAt === b.updatedAt &&
                a.badge === b.badge &&
                a.chart === b.chart
            );
        case "failed":
            return (
                b.status === "failed" &&
                a.error === b.error &&
                a.updatedAt === b.updatedAt &&
                a.items === b.items &&
                a.badge === b.badge &&
                a.chart === b.chart
            );
    }
}

// metadata 是每个 connector.list() 由 definition 新建的静态小对象（参数/端点/
// auth 描述），引用恒不等但进程内内容不变。按内容比较以保留 t153「reload 值
// 相等不重渲染」；仅序列化该小对象，不含快照 items 树。
function metadata_equal(a: PluginMetadata | null, b: PluginMetadata | null): boolean {
    if (a === null || b === null) return a === b;
    return JSON.stringify(a) === JSON.stringify(b);
}

function string_array_equal(
    a: readonly string[] | undefined,
    b: readonly string[] | undefined,
): boolean {
    if (a === b) return true;
    if (a === undefined || b === undefined) return false;
    if (a.length !== b.length) return false;
    return a.every((value, index) => value === b[index]);
}

function plugin_list_equal(a: ConnectorInfo[], b: ConnectorInfo[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const pa = a[i];
        const pb = b[i];
        if (pa === undefined || pb === undefined) return false;
        if (pa === pb) continue;
        if (pa.instanceId !== pb.instanceId) return false;
        if (pa.sourceInstanceId !== pb.sourceInstanceId) return false;
        if (pa.stateId !== pb.stateId) return false;
        if (pa.name !== pb.name) return false;
        if (pa.displayName !== pb.displayName) return false;
        if (pa.enabled !== pb.enabled) return false;
        if (pa.source !== pb.source) return false;
        if (!string_array_equal(pa.supportedProviders, pb.supportedProviders)) return false;
        if (!string_array_equal(pa.activeProviders, pb.activeProviders)) return false;
        if (!metadata_equal(pa.metadata, pb.metadata)) return false;
        if (!snapshot_equal(pa.snapshot, pb.snapshot)) return false;
    }
    return true;
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
