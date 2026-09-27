import { createHash } from "node:crypto";
import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod/v3";
import { createLogger } from "../../../shared/lib/logger";
import type { ConnectorDiscoveryEntry } from "./host-io";

const log = createLogger("connector-discovery-cache");

export const CONNECTOR_CACHE_SCHEMA_VERSION = 1;

export const DEFAULT_MAX_ENTRIES_PER_NAMESPACE = 50;
export const DEFAULT_MAX_TOTAL_ENTRIES = 500;
export const DEFAULT_MAX_VALUE_BYTES = 4096; // 4KB
export const DEFAULT_MAX_TOTAL_BYTES = 1 * 1024 * 1024; // 1MB

export const connector_discovery_entry_schema = z
    .object({
        signature: z.string(),
        action_id: z.string(),
        deployment_id: z.string().optional(),
        discovered_at: z.number(),
        hits: z.number().optional(),
    })
    .strict();

export interface DiscoveryStoreLimits {
    readonly max_entries_per_namespace?: number | undefined;
    readonly max_total_entries?: number | undefined;
    readonly max_value_bytes?: number | undefined;
    readonly max_total_bytes?: number | undefined;
}

export interface StoredDiscoveryRecord {
    entry: ConnectorDiscoveryEntry;
    last_accessed_at: number;
    byte_size: number;
    generation?: number | undefined;
}

interface SerializedCacheFile {
    schema_version: number;
    namespaces: Record<string, Record<string, StoredDiscoveryRecord>>;
}

export function compute_discovery_namespace(
    manifest_id: string,
    instance_id: string,
    script_code: string,
): string {
    const code_hash = createHash("sha256").update(script_code).digest("hex").slice(0, 16);
    return `${manifest_id}:${instance_id}:${code_hash}`;
}

const SECRET_KEY_PATTERN = /token|secret|password|cookie|auth|credential|api_key/i;

export function is_secret_refused(
    key: string,
    entry: ConnectorDiscoveryEntry,
    vault_secrets?: ReadonlySet<string>,
): boolean {
    if (SECRET_KEY_PATTERN.test(key)) {
        log.warn(`Refusing to store discovery record: key "${key}" matches secret identifier`);
        return true;
    }

    if (vault_secrets && vault_secrets.size > 0) {
        const values_to_check = [entry.signature, entry.action_id, entry.deployment_id ?? ""];
        for (const val of values_to_check) {
            if (!val) continue;
            for (const secret of vault_secrets) {
                if (secret && secret.length >= 4 && val.includes(secret)) {
                    log.warn(
                        "Refusing to store discovery record: value contains protected credential",
                    );
                    return true;
                }
            }
        }
    }

    return false;
}

export interface ConnectorDiscoveryStore {
    get(namespace: string, key: string): Promise<ConnectorDiscoveryEntry | null>;
    set(
        namespace: string,
        key: string,
        entry: ConnectorDiscoveryEntry,
        generation?: number,
    ): Promise<void>;
    delete(namespace: string, key: string): Promise<void>;
    get_snapshot(namespace: string): Record<string, ConnectorDiscoveryEntry>;
    merge_delta(
        namespace: string,
        delta: Record<string, ConnectorDiscoveryEntry | null>,
        generation?: number,
    ): Promise<void>;
}

export function create_connector_discovery_store(
    cache_file_path: string,
    limits?: DiscoveryStoreLimits,
): ConnectorDiscoveryStore {
    const max_entries_per_namespace =
        limits?.max_entries_per_namespace ?? DEFAULT_MAX_ENTRIES_PER_NAMESPACE;
    const max_total_entries = limits?.max_total_entries ?? DEFAULT_MAX_TOTAL_ENTRIES;
    const max_value_bytes = limits?.max_value_bytes ?? DEFAULT_MAX_VALUE_BYTES;
    const max_total_bytes = limits?.max_total_bytes ?? DEFAULT_MAX_TOTAL_BYTES;

    let namespaces: Record<string, Record<string, StoredDiscoveryRecord>> = {};
    let corrupted_reported = false;

    function load_from_disk(): void {
        if (!existsSync(cache_file_path)) {
            namespaces = {};
            return;
        }

        try {
            const raw = readFileSync(cache_file_path, "utf8");
            const parsed = JSON.parse(raw) as unknown;
            if (typeof parsed !== "object" || parsed === null) {
                namespaces = {};
                return;
            }
            const obj = parsed as Record<string, unknown>;
            if (obj["schema_version"] !== CONNECTOR_CACHE_SCHEMA_VERSION) {
                log.warn(
                    `Discovery cache schema mismatch (${String(obj["schema_version"])} != ${String(CONNECTOR_CACHE_SCHEMA_VERSION)}), discarding`,
                );
                namespaces = {};
                return;
            }
            const raw_ns = obj["namespaces"];
            if (typeof raw_ns === "object" && raw_ns !== null) {
                namespaces = raw_ns as Record<string, Record<string, StoredDiscoveryRecord>>;
            } else {
                namespaces = {};
            }
        } catch (err: unknown) {
            if (!corrupted_reported) {
                corrupted_reported = true;
                log.warn(
                    `Discovery cache file corrupted, discarding: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
            namespaces = {};
        }
    }

    function save_to_disk(): void {
        const payload: SerializedCacheFile = {
            schema_version: CONNECTOR_CACHE_SCHEMA_VERSION,
            namespaces,
        };
        const raw = JSON.stringify(payload, null, 2);
        const dir = dirname(cache_file_path);
        const tmp_path = `${cache_file_path}.tmp.${String(Date.now())}`;

        try {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            writeFileSync(tmp_path, raw, "utf8");
            renameSync(tmp_path, cache_file_path);
        } catch (write_err: unknown) {
            log.warn(
                `Failed to persist discovery cache to disk, falling back to memory: ${write_err instanceof Error ? write_err.message : String(write_err)}`,
            );
            try {
                if (existsSync(tmp_path)) {
                    unlinkSync(tmp_path);
                }
            } catch {
                // ignore tmp cleanup error
            }
        }
    }

    load_from_disk();

    function evict_lru_if_needed(target_ns: string): void {
        // 1. Per-namespace cap
        const ns_records = namespaces[target_ns];
        if (ns_records) {
            const keys = Object.keys(ns_records);
            if (keys.length > max_entries_per_namespace) {
                let oldest_key = keys[0];
                let oldest_time = Infinity;
                for (const k of keys) {
                    const rec = ns_records[k];
                    if (rec && rec.last_accessed_at < oldest_time) {
                        oldest_time = rec.last_accessed_at;
                        oldest_key = k;
                    }
                }
                if (oldest_key !== undefined) {
                    Reflect.deleteProperty(ns_records, oldest_key);
                }
            }
        }

        // 2. Global entry count cap & total bytes cap
        let total_entries = 0;
        let total_bytes = 0;
        interface GlobalItem {
            ns: string;
            key: string;
            accessed: number;
        }
        const all_items: GlobalItem[] = [];

        for (const [ns, map] of Object.entries(namespaces)) {
            for (const [k, rec] of Object.entries(map)) {
                total_entries++;
                total_bytes += rec.byte_size;
                all_items.push({ ns, key: k, accessed: rec.last_accessed_at });
            }
        }

        if (total_entries > max_total_entries || total_bytes > max_total_bytes) {
            all_items.sort((a, b) => a.accessed - b.accessed);
            while (
                (total_entries > max_total_entries || total_bytes > max_total_bytes) &&
                all_items.length > 0
            ) {
                const oldest = all_items.shift();
                if (!oldest) break;
                const rec = namespaces[oldest.ns]?.[oldest.key];
                if (rec) {
                    total_bytes -= rec.byte_size;
                    total_entries--;
                    const target_map = namespaces[oldest.ns];
                    if (target_map) {
                        Reflect.deleteProperty(target_map, oldest.key);
                    }
                }
            }
        }
    }

    return {
        get(namespace: string, key: string): Promise<ConnectorDiscoveryEntry | null> {
            const ns_records = namespaces[namespace];
            if (!ns_records) return Promise.resolve(null);
            const record = ns_records[key];
            if (!record) return Promise.resolve(null);

            record.last_accessed_at = Date.now();
            record.entry = {
                ...record.entry,
                hits: (record.entry.hits ?? 0) + 1,
            };
            save_to_disk();
            return Promise.resolve({ ...record.entry });
        },

        set(
            namespace: string,
            key: string,
            entry: ConnectorDiscoveryEntry,
            generation?: number,
        ): Promise<void> {
            if (is_secret_refused(key, entry)) {
                return Promise.resolve();
            }

            const val_json = JSON.stringify(entry);
            const byte_size = Buffer.byteLength(val_json, "utf8");
            if (byte_size > max_value_bytes) {
                return Promise.reject(
                    new Error(
                        `Discovery value exceeds maximum allowed size of ${String(max_value_bytes)} bytes`,
                    ),
                );
            }

            namespaces[namespace] ??= {};

            const existing = namespaces[namespace][key];
            if (
                existing?.generation !== undefined &&
                generation !== undefined &&
                generation < existing.generation
            ) {
                return Promise.resolve();
            }

            namespaces[namespace][key] = {
                entry: { ...entry },
                last_accessed_at: Date.now(),
                byte_size,
                generation,
            };

            evict_lru_if_needed(namespace);
            save_to_disk();
            return Promise.resolve();
        },

        delete(namespace: string, key: string): Promise<void> {
            const ns_records = namespaces[namespace];
            if (ns_records && key in ns_records) {
                Reflect.deleteProperty(ns_records, key);
                save_to_disk();
            }
            return Promise.resolve();
        },

        get_snapshot(namespace: string): Record<string, ConnectorDiscoveryEntry> {
            const result: Record<string, ConnectorDiscoveryEntry> = {};
            const ns_records = namespaces[namespace];
            if (!ns_records) return result;
            for (const [k, rec] of Object.entries(ns_records)) {
                result[k] = { ...rec.entry };
            }
            return result;
        },

        merge_delta(
            namespace: string,
            delta: Record<string, ConnectorDiscoveryEntry | null>,
            generation?: number,
        ): Promise<void> {
            namespaces[namespace] ??= {};
            const ns_records = namespaces[namespace];

            for (const [key, entry] of Object.entries(delta)) {
                const existing = ns_records[key];
                if (
                    existing?.generation !== undefined &&
                    generation !== undefined &&
                    generation < existing.generation
                ) {
                    continue;
                }

                if (entry === null) {
                    Reflect.deleteProperty(ns_records, key);
                } else {
                    if (is_secret_refused(key, entry)) {
                        continue;
                    }
                    const val_json = JSON.stringify(entry);
                    const byte_size = Buffer.byteLength(val_json, "utf8");
                    if (byte_size > max_value_bytes) {
                        continue;
                    }
                    ns_records[key] = {
                        entry: { ...entry },
                        last_accessed_at: Date.now(),
                        byte_size,
                        generation,
                    };
                }
            }

            evict_lru_if_needed(namespace);
            save_to_disk();
            return Promise.resolve();
        },
    };
}
