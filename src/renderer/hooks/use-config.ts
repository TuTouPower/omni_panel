import { useState, useEffect, useCallback } from "react";
import type { AppConfiguration } from "../../shared/types/config";

interface UseConfigResult {
    config: AppConfiguration | null;
    loading: boolean;
    error: string | null;
    save: (newConfig: AppConfiguration) => Promise<void>;
    saveSecrets: (stateId: string, secrets: Record<string, string>) => Promise<void>;
}

export function useConfig(): UseConfigResult {
    const [config, setConfig] = useState<AppConfiguration | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        window.usageboard.config
            .get()
            .then((c) => {
                if (!cancelled) {
                    setConfig(c);
                    setLoading(false);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "加载配置失败");
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const save = useCallback(async (newConfig: AppConfiguration) => {
        await window.usageboard.config.save(newConfig);
        setConfig(newConfig);
    }, []);

    const saveSecrets = useCallback(async (stateId: string, secrets: Record<string, string>) => {
        await window.usageboard.config.saveSecrets({ stateId, secrets });
    }, []);

    return { config, loading, error, save, saveSecrets };
}
