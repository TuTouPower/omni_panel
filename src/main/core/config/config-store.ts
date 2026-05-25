import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { type AppConfiguration, DEFAULT_CONFIGURATION, appConfigurationSchema } from "./types";
import { createLogger } from "../../../shared/lib/logger";

export interface AppConfigStore {
    load(): Promise<AppConfiguration>;
    save(config: AppConfiguration): Promise<void>;
    scheduleSave(config: AppConfiguration, delayMs?: number): void;
    flushPendingSave(): Promise<void>;
}

const log = createLogger("config-store");

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
    let pendingConfig: AppConfiguration | null = null;

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
                log.warn(
                    `Config schema mismatch at ${configPath}, using defaults`,
                    result.error.issues,
                );
                return { ...DEFAULT_CONFIGURATION };
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                    log.warn(`Config load failed (${configPath}), using defaults`, err);
                }
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
            log.debug(`Config saved to ${configPath} (${String(config.plugins.length)} plugins)`);
        },

        scheduleSave(config: AppConfiguration, delayMs = 500): void {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
            }
            pendingConfig = config;
            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                pendingConfig = null;
                void this.save(config).catch((err: unknown) => {
                    log.error("Debounced config save failed", err);
                });
            }, delayMs);
        },

        async flushPendingSave(): Promise<void> {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
                pendingTimer = null;
            }
            if (pendingConfig) {
                const cfg = pendingConfig;
                pendingConfig = null;
                await this.save(cfg);
            }
        },
    };
}
