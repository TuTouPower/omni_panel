import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { type AppConfiguration, DEFAULT_CONFIGURATION, appConfigurationSchema } from "./types";
import { createLogger } from "../../../shared/lib/logger";
import { redact_config_json, redact_config_raw } from "../../../shared/lib/config_redaction";
import { writeJsonAtomic } from "../storage/write-json";
import { connectorProviderSchema, manifest_schema } from "../../../shared/schemas/manifest";

/**
 * 原子写 bak 文件：先写 tmp 再 rename，防强杀中断致 bak 损坏。
 * 之前用 writeFile 直接写 bak，进程 mid-write 被杀时 bak 变 null bytes，
 * 导致 configStore corrupt 检测后 bak 也不可恢复 -> fallback defaults -> auto_seed 覆盖 -> 用户数据丢失。
 */
async function writeBakAtomic(bakPath: string, content: string): Promise<void> {
    const tmpPath = `${bakPath}.tmp`;
    await writeFile(tmpPath, content, "utf8");
    await rename(tmpPath, bakPath);
}

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
    // Number of saves currently in-flight (between doSave start and settle).
    // hasPendingSave must reflect these too: will-quit used to skip waiting
    // when the debounce timer had fired but the write was still on disk (A5).
    let inflightSaves = 0;

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
        inflightSaves++;
        const run = saveTail.then(
            () => doSave(config),
            () => doSave(config),
        );
        // Swallow rejection at the chain level so a failed save does not break
        // the queue. The original caller still sees the rejection via `run`.
        saveTail = run.catch(() => {
            /* chain continues regardless of individual save failures */
        });
        // Decrement only after the chain settles, so hasPendingSave sees the
        // in-flight window even when the debounce timer has already cleared.
        saveTail = saveTail.then(() => {
            inflightSaves--;
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
                        recovered_from_bak = bak_result.data as AppConfiguration;
                    }
                } catch {
                    // .bak not available or also corrupt
                }
                if (recovered_from_bak) {
                    // Don't overwrite the good .bak with the corrupted main
                    // content (D13) — that would destroy the only known-good
                    // backup on the next corruption.
                    log.warn(
                        `Config schema mismatch at ${configPath}, recovered from backup`,
                        result.error.issues,
                    );
                    return recovered_from_bak;
                }
                // Main is corrupt AND no valid .bak to recover - back up the
                // corrupted main content before throwing, so there's still
                // something to inspect later. Do NOT fallback to defaults:
                // returning DEFAULT_CONFIGURATION triggers auto_seed in
                // index.ts which overwrites config.json with new instanceIds,
                // orphaning all observation-store data (P0 data loss).
                try {
                    await writeBakAtomic(`${configPath}.bak`, raw);
                } catch {
                    // non-critical
                }
                log.error(
                    `Config schema mismatch at ${configPath}, backup also invalid. ` +
                        `NOT falling back to defaults to prevent auto_seed overwrite. ` +
                        `Manual recovery required (restore config.json from backup or reconfigure).`,
                    result.error.issues,
                );
                throw new Error(
                    `Config corrupt at ${configPath} and no valid .bak. ` +
                        `Refusing to start with defaults to prevent data loss. ` +
                        `Restore config.json manually or remove it to reset.`,
                );
            } catch (err: unknown) {
                // load() 本身抛错（非 ENOENT）：config 文件存在但 readFile/parse 异常。
                // 同样不 fallback defaults（防 auto_seed 覆盖），而是抛错停止启动。
                if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                    // config.json 不存在 = 首次启动，返回 defaults 合理（auto_seed 填内置 connector）
                    return { ...DEFAULT_CONFIGURATION };
                }
                // 已有 config 但读取失败（IO 错误等）→ 备份损坏文件后抛错
                try {
                    const raw = await readFile(configPath, "utf8").catch(() => null);
                    if (raw) await writeBakAtomic(`${configPath}.bak`, raw);
                } catch {
                    // non-critical
                }
                log.error(
                    `Config load failed (${configPath}). ` +
                        `NOT falling back to defaults to prevent auto_seed overwrite.`,
                    err,
                );
                throw new Error(
                    `Config load failed at ${configPath}: ${String(err)}. ` +
                        `Refusing to start with defaults. Manual recovery required.`,
                );
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
            // Wait for any save that already started to finish writing (A5) —
            // otherwise will-quit could exit mid-write and truncate the file.
            await saveTail;
        },

        hasPendingSave(): boolean {
            return pendingTimer !== null || inflightSaves > 0;
        },
    };
}
