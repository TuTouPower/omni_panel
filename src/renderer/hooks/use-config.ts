import { useState, useEffect, useCallback } from "react";
import type { AppConfiguration } from "../../shared/types/config";

const MODULE = "use-config";

interface UseConfigResult {
    config: AppConfiguration | null;
    hasSecrets: Record<string, Record<string, boolean>>;
    loading: boolean;
    error: string | null;
    save: (newConfig: AppConfiguration) => Promise<void>;
    saveSecrets: (instanceId: string, secrets: Record<string, string>) => Promise<void>;
    duplicate: (instanceId: string) => Promise<void>;
}

export function useConfig(): UseConfigResult {
    const [config, setConfig] = useState<AppConfiguration | null>(null);
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

    const save = useCallback(async (newConfig: AppConfiguration) => {
        window.usageboard.log({ level: "debug", module: MODULE, message: "Saving config" });
        await window.usageboard.config.save(newConfig);
        setConfig(newConfig);
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

    const duplicate = useCallback(async (instanceId: string) => {
        window.usageboard.log({
            level: "debug",
            module: MODULE,
            message: `Duplicating plugin ${instanceId}`,
        });
        await window.usageboard.config.duplicate(instanceId);
        // Reload config to reflect the new duplicate
        const result = await window.usageboard.config.get();
        setConfig(result.config);
        setHasSecrets(result.hasSecrets);
    }, []);

    return { config, hasSecrets, loading, error, save, saveSecrets, duplicate };
}
