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
}

export function use_config(): UseConfigResult {
    const [config, setConfig] = useState<AppConfiguration | null>(null);
    const config_ref = useRef<AppConfiguration | null>(null);
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
            // Skip if this is the echo of our own save (same reference)
            if (incoming === config_ref.current) return;
            config_ref.current = incoming;
            setConfig(incoming);
        });
        return unsub;
    }, []);

    const save = useCallback((newConfig: AppConfiguration): Promise<void> => {
        window.usageboard.log({ level: "debug", module: MODULE, message: "Saving config" });
        config_ref.current = newConfig;
        setConfig(newConfig);
        const p = save_queue_ref.current.then(() => window.usageboard.config.save(newConfig));
        save_queue_ref.current = p.catch((err: unknown) => {
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
        save_queue_ref.current = save_queue_ref.current
            .then(() => window.usageboard.config.save(next))
            .catch((err: unknown) => {
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
        setConfig(result.config);
        setHasSecrets(result.hasSecrets);
        return created;
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
    };
}
