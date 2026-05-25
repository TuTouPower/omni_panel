import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { type AppConfiguration, DEFAULT_CONFIGURATION, appConfigurationSchema } from "./types";

export interface AppConfigStore {
    load(): Promise<AppConfiguration>;
    save(config: AppConfiguration): Promise<void>;
    scheduleSave(config: AppConfiguration, delayMs?: number): void;
}

function sortKeys(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(sortKeys);
    if (obj !== null && typeof obj === "object") {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(obj).sort()) {
            sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
        }
        return sorted;
    }
    return obj;
}

export function createConfigStore(configPath: string): AppConfigStore {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    return {
        async load(): Promise<AppConfiguration> {
            try {
                const raw = await readFile(configPath, "utf8");
                const parsed = JSON.parse(raw) as unknown;
                const result = appConfigurationSchema.safeParse(parsed);
                if (result.success) {
                    const migrated = {
                        ...result.data,
                        plugins: result.data.plugins.map((p) => ({
                            ...p,
                            instanceId: p.instanceId ?? p.stateId,
                        })),
                    } as AppConfiguration;
                    return migrated;
                }
                return { ...DEFAULT_CONFIGURATION };
            } catch {
                return { ...DEFAULT_CONFIGURATION };
            }
        },

        async save(config: AppConfiguration): Promise<void> {
            await mkdir(dirname(configPath), { recursive: true });
            const sorted = sortKeys(config);
            const json = JSON.stringify(sorted, null, 2);
            const tmpPath = `${configPath}.tmp`;
            await writeFile(tmpPath, json, "utf8");
            await rename(tmpPath, configPath);
        },

        scheduleSave(config: AppConfiguration, delayMs = 500): void {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
            }
            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                void this.save(config);
            }, delayMs);
        },
    };
}
