import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type AppConfiguration, DEFAULT_CONFIGURATION, appConfigurationSchema } from "./types";
import { createLogger } from "../../../shared/lib/logger";
import { redact_config_json, redact_config_raw } from "../../../shared/lib/config_redaction";
import { writeJsonAtomic } from "../storage/write-json";
import { connectorProviderSchema, manifest_schema } from "../../../shared/schemas/manifest";

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

// Returns true when the plugin's connector manifest exists and declares a
// provider that survives the connectorProviderSchema whitelist
// (usageProviderSchema ∪ {"cpa"}). Returns false for orphan plugins (no
// manifest at the path) and for plugins whose manifest provider is no longer
// allowed — e.g. leftover `test-observe` entries from when the fixture was
// bundled and auto-seeded into config.json.
async function is_plugin_healthy(executable_path: string): Promise<boolean> {
    try {
        const raw = await readFile(join(executable_path, "manifest.json"), "utf8");
        const parsed = JSON.parse(raw) as unknown;
        const result = manifest_schema.safeParse(parsed);
        if (!result.success) return false;
        return connectorProviderSchema.safeParse(result.data.provider).success;
    } catch {
        return false;
    }
}

async function prune_invalid_plugins(
    plugins: readonly { executablePath: string }[],
): Promise<number[]> {
    const keep_indices: number[] = [];
    // Health checks run in parallel via Promise.all. With a very large plugin
    // count (>50) this could saturate the I/O thread pool; acceptable for now
    // because typical installs have <20 plugins. If that changes, add a
    // concurrency limiter (e.g. p-limit) here.
    const verdicts = await Promise.all(plugins.map((p) => is_plugin_healthy(p.executablePath)));
    verdicts.forEach((healthy, idx) => {
        if (healthy) keep_indices.push(idx);
    });
    return keep_indices;
}

export function createConfigStore(configPath: string): AppConfigStore {
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingConfig: AppConfiguration | null = null;
    // Serializes saves so concurrent save() calls cannot interleave reads/writes
    // or lose the final state to a torn write. Modeled on vault-backend's lock:
    // each save awaits the prior tail, and a rejection on one save MUST NOT poison
    // the chain — otherwise a single transient write failure would block every
    // subsequent save until process restart.
    let saveTail: Promise<void> = Promise.resolve();

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

    function enqueueSave(config: AppConfiguration): Promise<void> {
        const run = saveTail.then(
            () => doSave(config),
            () => doSave(config),
        );
        // Swallow rejection at the chain level so a failed save does not break
        // the queue. The original caller still sees the rejection via `run`.
        saveTail = run.catch(() => {
            /* chain continues regardless of individual save failures */
        });
        return run;
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
                    let migrated = {
                        ...result.data,
                        plugins: result.data.plugins.map((p) => ({
                            ...p,
                            instanceId: p.instanceId ?? p.stateId,
                        })),
                    } as AppConfiguration;

                    // Prune plugins whose connector manifest is missing or
                    // declares a provider that is no longer whitelisted
                    // (e.g. leftover `test-observe` entries from before the
                    // fixture was moved out of the bundled connectors dir).
                    const keep_indices = await prune_invalid_plugins(migrated.plugins);
                    if (keep_indices.length !== migrated.plugins.length) {
                        const dropped = migrated.plugins.length - keep_indices.length;
                        log.warn(`Pruning ${String(dropped)} invalid plugin(s) from ${configPath}`);
                        const pruned_plugins = keep_indices
                            .map((i) => migrated.plugins[i])
                            .filter((p): p is NonNullable<typeof p> => p !== undefined);
                        const pruned = {
                            ...migrated,
                            plugins: pruned_plugins,
                        };
                        // Persist the cleaned config so the prune is durable
                        // and does not repeat on every load.
                        try {
                            await writeJsonAtomic(configPath, sortKeys(pruned));
                        } catch (err) {
                            log.warn(`Failed to persist pruned config at ${configPath}`, err);
                        }
                        migrated = pruned;
                    }

                    if (shouldLogRawStorage()) {
                        log.debug("config parsed raw", {
                            filePath: configPath,
                            config: redact_config_raw(migrated),
                        });
                    }
                    return migrated;
                }
                // Try recovering from .bak before backing up corrupted file
                let recovered_from_bak: AppConfiguration | null = null;
                try {
                    const bak_raw = await readFile(`${configPath}.bak`, "utf8");
                    const bak_parsed = JSON.parse(bak_raw) as unknown;
                    const bak_normalized =
                        bak_parsed !== null &&
                        typeof bak_parsed === "object" &&
                        !Array.isArray(bak_parsed)
                            ? stripRemovedConfigFields(bak_parsed as Record<string, unknown>)
                            : bak_parsed;
                    const bak_result = appConfigurationSchema.safeParse(bak_normalized);
                    if (bak_result.success) {
                        recovered_from_bak = {
                            ...bak_result.data,
                            plugins: bak_result.data.plugins.map((p) => ({
                                ...p,
                                instanceId: p.instanceId ?? p.stateId,
                            })),
                        };
                    }
                } catch {
                    // .bak not available or also corrupt
                }
                // Backup corrupted file (after reading .bak so we don't overwrite it)
                try {
                    await writeFile(`${configPath}.bak`, raw, "utf8");
                } catch {
                    // non-critical
                }
                if (recovered_from_bak) {
                    log.warn(
                        `Config schema mismatch at ${configPath}, recovered from backup`,
                        result.error.issues,
                    );
                    return recovered_from_bak;
                }
                log.warn(
                    `Config schema mismatch at ${configPath}, backup also invalid, using defaults`,
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
            await enqueueSave(config);
        },

        scheduleSave(config: AppConfiguration, delayMs = 500): void {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
            }
            pendingConfig = config;
            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                const cfg = pendingConfig;
                pendingConfig = null;
                if (cfg) {
                    void this.save(cfg).catch((err: unknown) => {
                        log.error("Debounced config save failed", err);
                    });
                }
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
