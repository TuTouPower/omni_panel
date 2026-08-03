import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type AppConfiguration, DEFAULT_CONFIGURATION, appConfigurationSchema } from "./types";
import { createLogger } from "../../../shared/lib/logger";
import { redact_config_json, redact_config_raw } from "../../../shared/lib/config_redaction";
import { writeJsonAtomic, writeFileAtomic } from "../storage/write-json";
import { connectorProviderSchema, manifest_schema } from "../../../shared/schemas/manifest";

/**
 * 原子写 bak 文件：先写 tmp 再 fsync 再 rename，防强杀中断致 bak 损坏。
 * 之前用 writeFile 直接写 bak，进程 mid-write 被杀时 bak 变 null bytes，
 * 导致 configStore corrupt 检测后 bak 也不可恢复 -> fallback defaults -> auto_seed 覆盖 -> 用户数据丢失。
 */
async function writeBakAtomic(bakPath: string, content: string): Promise<void> {
    await writeFileAtomic(bakPath, content);
}

/**
 * Electron creates the user data directory before app code runs, so "directory
 * exists" is no longer a reliable signal for "this is not a first start". Check
 * for files that are only created after a successful config-driven
 * initialization; if none exist, treat the missing config.json as a first start
 * and seed defaults. Otherwise refuse to overwrite existing user data.
 */
async function has_previous_user_data(configDir: string, configPath: string): Promise<boolean> {
    let entries: string[];
    try {
        entries = await readdir(configDir);
    } catch {
        return false;
    }

    const evidenceFiles = new Set([
        `${configPath}.bak`,
        `${configPath}.before_restore`,
        join(configDir, "secrets.json"),
        join(configDir, "secrets.vault"),
        join(configDir, "secrets.vault.bak"),
        join(configDir, "snapshot-cache.json"),
        join(configDir, "token-stats-scan-state.json"),
    ]);

    for (const name of entries) {
        const fullPath = join(configDir, name);
        if (evidenceFiles.has(fullPath)) {
            return true;
        }
        if (name === "plugin-caches" || name === "connectors") {
            try {
                const children = await readdir(fullPath);
                if (children.length > 0) {
                    return true;
                }
            } catch {
                // ignore
            }
        }
    }
    return false;
}

export interface AppConfigStore {
    load(): Promise<AppConfiguration>;
    save(config: AppConfiguration): Promise<void>;
    /**
     * Debounced save. `config` may be a thunk, which is resolved when the
     * debounce fires rather than when it is scheduled — callers that merge a
     * single field (window bounds) MUST pass a thunk, otherwise a config saved
     * by the renderer inside the debounce window is reverted by the stale
     * snapshot captured here.
     */
    scheduleSave(config: AppConfiguration | (() => AppConfiguration), delayMs?: number): void;
    flushPendingSave(): Promise<void>;
    hasPendingSave(): boolean;
    /**
     * One-shot health pass (t195): drop plugins whose connector manifest is
     * missing or whose provider is outside the whitelist, persist the cleaned
     * config and return it. Called at startup and after structural changes
     * (import), NOT on every load — load() is a memory-cache hit.
     */
    prune_unhealthy_plugins(): Promise<AppConfiguration>;
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

/**
 * Parse, migrate and normalize a config JSON string. Returns `null` for empty
 * or schema-invalid input so callers can decide whether to try backups.
 *
 * Does NOT prune plugins whose connector manifest is unhealthy — that check is
 * a one-shot startup/structural-change pass via `prune_unhealthy_plugins`
 * (t195), so hot-path loads skip per-plugin manifest stat.
 */
function parse_config(raw: string): AppConfiguration | null {
    const parsed = raw.trim().length === 0 ? null : (JSON.parse(raw) as unknown);
    const normalized =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
            ? stripRemovedConfigFields(parsed as Record<string, unknown>)
            : parsed;
    const result = appConfigurationSchema.safeParse(normalized);
    if (!result.success) {
        return null;
    }
    return {
        ...result.data,
        plugins: result.data.plugins.map((p) => ({
            ...p,
            instanceId: p.instanceId ?? p.stateId,
        })),
    } as AppConfiguration;
}

/**
 * Try to load a valid config from a backup file. Returns null if unavailable or
 * invalid.
 */
async function try_load_backup(backupPath: string): Promise<AppConfiguration | null> {
    try {
        const raw = await readFile(backupPath, "utf8");
        const parsed = parse_config(raw);
        if (parsed) {
            log.warn(`Recovered config from backup ${backupPath}`);
        }
        return parsed;
    } catch {
        return null;
    }
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
    let pendingConfig: AppConfiguration | (() => AppConfiguration) | null = null;
    // t195: in-memory cache. load() hits it instead of re-reading + re-parsing
    // the file + per-plugin manifest health checks. save() is the single write
    // entry and refreshes the cache with the persisted value, so readers always
    // observe the latest saved config.
    let cached_config: AppConfiguration | null = null;
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
        cached_config = config;
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

    async function load_uncached(): Promise<AppConfiguration> {
        try {
            const raw = await readFile(configPath, "utf8");
            if (shouldLogRawStorage()) {
                log.debug("config load raw", {
                    filePath: configPath,
                    raw: redact_config_json(raw),
                });
            }
            const parsed = parse_config(raw);
            if (parsed) {
                if (shouldLogRawStorage()) {
                    log.debug("config parsed raw", {
                        filePath: configPath,
                        config: redact_config_raw(parsed),
                    });
                }
                return parsed;
            }
            // Main config is empty/corrupt: try backups before backing up the bad file.
            const recovered =
                (await try_load_backup(`${configPath}.bak`)) ??
                (await try_load_backup(`${configPath}.before_restore`));
            if (recovered) {
                log.warn(`Config schema mismatch at ${configPath}, recovered from backup`);
                return recovered;
            }
            // Main is corrupt AND no valid .bak to recover - back up the
            // corrupted main content before throwing, so there's still
            // something to inspect later. Do NOT fallback to defaults:
            // returning DEFAULT_CONFIGURATION triggers auto_seed in
            // index.ts which overwrites config.json with new instanceIds,
            // orphaning all observation-store data (P0 data loss).
            try {
                // 空/仅空白的主文件不备份，避免覆盖可能仍然有效的 .bak。
                if (raw.trim().length > 0) {
                    await writeBakAtomic(`${configPath}.bak`, raw);
                }
            } catch {
                // non-critical
            }
            log.error(
                `Config schema mismatch at ${configPath}, backup also invalid. ` +
                    `NOT falling back to defaults to prevent auto_seed overwrite. ` +
                    `Manual recovery required (restore config.json from backup or reconfigure).`,
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
                // 区分「首次启动」与「config.json 被误删/移动」。Electron 会在 app 代码运行前
                // 创建 userData 目录，因此不能仅靠「目录是否存在」判断；改检查是否留有成功
                // 初始化后才会产生的用户数据文件。后者不能返回 defaults，否则会触发 auto_seed
                // 覆盖用户数据（P0）。
                const configDir = dirname(configPath);
                try {
                    await stat(configDir);
                } catch (dirErr: unknown) {
                    if ((dirErr as NodeJS.ErrnoException).code === "ENOENT") {
                        // 首次启动：目录不存在，返回 defaults，由 auto_seed 填充内置 connector。
                        return { ...DEFAULT_CONFIGURATION };
                    }
                    // 目录 stat 出现其它错误，直接抛出原错误。
                    throw err;
                }
                const hasUserData = await has_previous_user_data(configDir, configPath);
                if (!hasUserData) {
                    // 目录存在但里面只有 Electron 自动文件或空的初始化产物，视为首次启动。
                    return { ...DEFAULT_CONFIGURATION };
                }
                // 目录存在且有此前成功运行留下的用户数据文件，但 config.json 缺失：
                // 先尝试从备份恢复，避免一次误删/写坏就拒绝启动。
                const recovered =
                    (await try_load_backup(`${configPath}.bak`)) ??
                    (await try_load_backup(`${configPath}.before_restore`));
                if (recovered) {
                    log.warn(
                        `Config file missing at ${configPath} but directory exists. ` +
                            `Recovered from backup; a manual check is still recommended.`,
                    );
                    return recovered;
                }
                // 无可用备份时才拒绝启动，防止 auto_seed 覆盖已有数据。
                log.error(
                    `Config file missing at ${configPath} but directory exists. ` +
                        `NOT falling back to defaults to prevent auto_seed overwrite. ` +
                        `Restore config.json manually or remove the directory to reset.`,
                );
                throw new Error(
                    `Config file missing at ${configPath} but directory exists. ` +
                        `Refusing to start with defaults to prevent data loss. ` +
                        `Restore config.json manually or remove the directory to reset.`,
                );
            }
            // 已有 config 但读取失败（IO 错误等）→ 备份损坏文件后抛错
            try {
                const raw = await readFile(configPath, "utf8").catch(() => null);
                // 空/仅空白的主文件不备份，避免覆盖可能仍然有效的 .bak。
                if (raw && raw.trim().length > 0) {
                    await writeBakAtomic(`${configPath}.bak`, raw);
                }
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
    }

    async function prune_unhealthy_plugins(): Promise<AppConfiguration> {
        const config = cached_config ?? (await load_uncached());
        const keep_indices = await prune_invalid_plugins(config.plugins);
        if (keep_indices.length === config.plugins.length) return config;
        const dropped = config.plugins.length - keep_indices.length;
        log.warn(`Pruning ${String(dropped)} invalid plugin(s) from ${configPath}`);
        const pruned_plugins = keep_indices
            .map((i) => config.plugins[i])
            .filter((p): p is NonNullable<typeof p> => p !== undefined);
        const pruned: AppConfiguration = { ...config, plugins: pruned_plugins };
        await enqueueSave(pruned);
        return pruned;
    }

    return {
        async load(): Promise<AppConfiguration> {
            if (cached_config) return cached_config;
            const config = await load_uncached();
            cached_config = config;
            return config;
        },

        async save(config: AppConfiguration): Promise<void> {
            await enqueueSave(config);
        },

        scheduleSave(config: AppConfiguration | (() => AppConfiguration), delayMs = 500): void {
            if (pendingTimer) {
                clearTimeout(pendingTimer);
            }
            pendingConfig = config;
            pendingTimer = setTimeout(() => {
                pendingTimer = null;
                const cfg = pendingConfig;
                pendingConfig = null;
                if (cfg) {
                    void this.save(typeof cfg === "function" ? cfg() : cfg).catch(
                        (err: unknown) => {
                            log.error("Debounced config save failed", err);
                        },
                    );
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
                await this.save(typeof cfg === "function" ? cfg() : cfg);
            }
            // Wait for any save that already started to finish writing (A5) —
            // otherwise will-quit could exit mid-write and truncate the file.
            await saveTail;
        },

        hasPendingSave(): boolean {
            return pendingTimer !== null || inflightSaves > 0;
        },

        async prune_unhealthy_plugins(): Promise<AppConfiguration> {
            return prune_unhealthy_plugins();
        },
    };
}
