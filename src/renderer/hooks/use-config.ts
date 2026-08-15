/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useEffect, useCallback, useRef } from "react";
import type { AppConfiguration } from "../../shared/types/config";

const MODULE = "use-config";

interface UseConfigResult {
    config: AppConfiguration | null;
    hasSecrets: Record<string, Record<string, boolean>>;
    loading: boolean;
    error: string | null;
    save: (newConfig: AppConfiguration) => Promise<void>;
    update_config: (updater: (prev: AppConfiguration) => AppConfiguration) => void;
    saveSecrets: (instanceId: string, secrets: Record<string, string>) => Promise<void>;
    getSecrets: (instanceId: string) => Promise<Record<string, string>>;
    duplicate: (instanceId: string) => Promise<{ instanceId: string }>;
    /** t252: 手动重拉 config（设置面板标题栏刷新按钮）。 */
    reload: () => Promise<void>;
}

export function use_config(): UseConfigResult {
    const [config, setConfig] = useState<AppConfiguration | null>(null);
    const config_ref = useRef<AppConfiguration | null>(null);
    // t390 AC-001: 最近一次成功写盘的确认值——失败回滚目标（非本次乐观前值）。
    // 串行队列下连续失败时，回滚到最近确认值而非前一乐观值，内存与磁盘一致。
    const confirmed_ref = useRef<AppConfiguration | null>(null);
    const save_queue_ref = useRef(Promise.resolve());
    const [hasSecrets, setHasSecrets] = useState<Record<string, Record<string, boolean>>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        window.usageboard.log({ level: "debug", module: MODULE, message: "Loading config" });
        window.usageboard.config
            .get()
            .then((result) => {
                if (!cancelled) {
                    window.usageboard.log({
                        level: "info",
                        module: MODULE,
                        message: `Config loaded: ${String(result.config.plugins.length)} plugins`,
                    });
                    config_ref.current = result.config;
                    confirmed_ref.current = result.config;
                    setConfig(result.config);
                    setHasSecrets(result.hasSecrets);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    const message = err instanceof Error ? err.message : "加载配置失败";
                    window.usageboard.log({
                        level: "error",
                        module: MODULE,
                        message: `Failed to load config: ${message}`,
                    });
                    setError(message);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Listen for config changes from other windows (e.g. popup toggling a provider)
    useEffect(() => {
        const unsub = window.usageboard.event.onConfigChange?.((incoming) => {
            const current = config_ref.current;
            // Skip if this is the echo of our own save (same reference)
            if (incoming === current) return;
            // t153: IPC broadcasts are deserialized, so the echo never matches
            // by reference — compare by value to avoid re-rendering every
            // window on every config save.
            if (current !== null && JSON.stringify(incoming) === JSON.stringify(current)) return;
            config_ref.current = incoming;
            // t390 f001: 外部广播（其它窗口已写盘）同步最近确认值——否则本窗口
            // save 失败会回滚到过期 base。
            confirmed_ref.current = incoming;
            setConfig(incoming);
        });
        return unsub;
    }, []);

    const save = useCallback((newConfig: AppConfiguration): Promise<void> => {
        window.usageboard.log({ level: "debug", module: MODULE, message: "Saving config" });
        config_ref.current = newConfig;
        setConfig(newConfig);
        const p = save_queue_ref.current.then(() => window.usageboard.config.save(newConfig));
        save_queue_ref.current = p
            .then(() => {
                // t390 AC-001: 写盘成功 → 更新最近确认值。
                confirmed_ref.current = newConfig;
            })
            .catch((err: unknown) => {
                // t356 AC-002 + t390 AC-001: 写盘失败回滚到最近确认值（非本次
                // 乐观前值）——串行队列连续失败时终态与磁盘一致。仅当本次乐观
                // 更新仍是当前值时回滚（后值已覆盖时不破坏后续乐观更新）。
                if (config_ref.current === newConfig) {
                    config_ref.current = confirmed_ref.current;
                    setConfig(confirmed_ref.current);
                }
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `config save failed: ${err instanceof Error ? err.message : String(err)}`,
                });
                return undefined;
            });
        return p;
    }, []);

    const update_config = useCallback((updater: (prev: AppConfiguration) => AppConfiguration) => {
        const current = config_ref.current;
        if (!current) return;
        const next = updater(current);
        config_ref.current = next;
        setConfig(next);
        // t356 AC-002 + t390 AC-003: 写盘失败回滚到最近确认值（非本次乐观前值）。
        save_queue_ref.current = save_queue_ref.current
            .then(() => window.usageboard.config.save(next))
            .then(() => {
                confirmed_ref.current = next;
            })
            .catch((err: unknown) => {
                if (config_ref.current === next) {
                    config_ref.current = confirmed_ref.current;
                    setConfig(confirmed_ref.current);
                }
                window.usageboard.log({
                    level: "error",
                    module: MODULE,
                    message: `config save failed: ${err instanceof Error ? err.message : String(err)}`,
                });
            });
    }, []);

    const saveSecrets = useCallback(async (instanceId: string, secrets: Record<string, string>) => {
        window.usageboard.log({
            level: "debug",
            module: MODULE,
            message: `Saving secrets for ${instanceId}`,
        });
        await window.usageboard.config.saveSecrets({ instanceId, secrets });
        // Update hasSecrets for saved keys
        setHasSecrets((prev) => ({
            ...prev,
            [instanceId]: {
                ...(prev[instanceId] ?? {}),
                ...Object.fromEntries(Object.keys(secrets).map((k) => [k, true])),
            },
        }));
    }, []);

    const getSecrets = useCallback(async (instanceId: string) => {
        return window.usageboard.config.getSecrets(instanceId);
    }, []);

    const duplicate = useCallback(async (instanceId: string) => {
        window.usageboard.log({
            level: "debug",
            module: MODULE,
            message: `Duplicating plugin ${instanceId}`,
        });
        const created = await window.usageboard.config.duplicate(instanceId);
        // Reload config to reflect the new duplicate
        const result = await window.usageboard.config.get();
        config_ref.current = result.config;
        confirmed_ref.current = result.config;
        setConfig(result.config);
        setHasSecrets(result.hasSecrets);
        return created;
    }, []);

    const reload = useCallback(async (): Promise<void> => {
        const result = await window.usageboard.config.get();
        config_ref.current = result.config;
        // t390 f001: 从权威源刷新时同步最近确认值——否则外部广播/重载后 save
        // 失败会回滚到过期 base（跨窗口漂移回归）。
        confirmed_ref.current = result.config;
        setConfig(result.config);
        setHasSecrets(result.hasSecrets);
        setLoading(false);
        setError(null);
    }, []);

    return {
        config,
        hasSecrets,
        loading,
        error,
        save,
        update_config,
        saveSecrets,
        getSecrets,
        duplicate,
        reload,
    };
}
