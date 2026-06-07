import { readFile, writeFile } from "node:fs/promises";
import { type AppConfiguration, DEFAULT_CONFIGURATION, appConfigurationSchema } from "./types";
import { createLogger } from "../../../shared/lib/logger";
import { redact_config_json, redact_config_raw } from "../../../shared/lib/config_redaction";
import { writeJsonAtomic } from "../storage/write-json";

export interface AppConfigStore {
    load(): Promise<AppConfiguration>;
    save(config: AppConfiguration): Promise<void>;
    scheduleSave(config: AppConfiguration, delayMs?: number): void;
    flushPendingSave(): Promise<void>;
    hasPendingSave(): boolean;
}

const log = createLogger("config-store");

function shouldLogRawStorage(): boolean {
    return process.env["NODE_ENV"] === "development";
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

function stripRemovedConfigFields(config: Record<string, unknown>): Record<string, unknown> {
    const { overviewDisplayMode: _overviewDisplayMode, ...rest } = config;
    void _overviewDisplayMode;
    return rest;
}

export function createConfigStore(configPath: string): AppConfigStore {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingConfig: AppConfiguration | null = null;
    let saveQueue: Promise<void> = Promise.resolve();

    async function doSave(config: AppConfiguration): Promise<void> {
        const sorted = sortKeys(config);
        if (shouldLogRawStorage()) {
            log.debug("config save payload raw", {
                filePath: configPath,
                config: redact_config_raw(sorted),
            });
        }
        await writeJsonAtomic(configPath, sorted);
        if (shouldLogRawStorage()) {
            log.debug("config save complete raw", { filePath: configPath });
        }
        log.debug(`Config saved to ${configPath} (${String(config.plugins.length)} plugins)`);
    }

    return {
        async load(): Promise<AppConfiguration> {
            try {
                const raw = await readFile(configPath, "utf8");
                if (shouldLogRawStorage()) {
                    log.debug("config load raw", {
                        filePath: configPath,
                        raw: redact_config_json(raw),
                    });
                }
                const parsed = JSON.parse(raw) as unknown;
                const normalized =
                    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
                        ? stripRemovedConfigFields(parsed as Record<string, unknown>)
                        : parsed;
                const result = appConfigurationSchema.safeParse(normalized);
                if (result.success) {
                    const migrated = {
                        ...result.data,
                        plugins: result.data.plugins.map((p) => ({
                            ...p,
                            instanceId: p.instanceId ?? p.stateId,
                        })),
                    } as AppConfiguration;
                    if (shouldLogRawStorage()) {
                        log.debug("config parsed raw", {
                            filePath: configPath,
                            config: redact_config_raw(migrated),
                        });
                    }
                    return migrated;
                }
                // Backup corrupted file before falling back to defaults
                try {
                    await writeFile(`${configPath}.bak`, raw, "utf8");
                } catch {
                    // non-critical
                }
                log.warn(
                    `Config schema mismatch at ${configPath}, backed up and using defaults`,
                    result.error.issues,
                );
                return { ...DEFAULT_CONFIGURATION };
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                    // Backup corrupted file
                    try {
                        const raw = await readFile(configPath, "utf8").catch(() => null);
                        if (raw) await writeFile(`${configPath}.bak`, raw, "utf8");
                    } catch {
                        // non-critical
                    }
                    log.warn(`Config load failed (${configPath}), using defaults`, err);
                }
                return { ...DEFAULT_CONFIGURATION };
            }
        },

        async save(config: AppConfiguration): Promise<void> {
            saveQueue = saveQueue.then(() => doSave(config));
            await saveQueue;
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

        hasPendingSave(): boolean {
            return pendingTimer !== null;
        },
    };
}
