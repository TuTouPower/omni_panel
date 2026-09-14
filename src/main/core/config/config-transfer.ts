import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod/v3";
import type { AppConfiguration, ConnectorConfiguration } from "../../../shared/types/config";
import type { ConfigExportData } from "../../../shared/types/ipc";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import type { AppConfigStore } from "./config-store";
import { appConfigurationSchema } from "./types";
import { build_secret_param_keys } from "./secret_param_keys";
import { type SecretsStore } from "./secrets-store";
import { remap_connector_paths } from "./manifest-identity";
import { writeFileAtomic } from "../storage/write-json";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("config:transfer");

export const CONFIG_TRANSFER_FORMAT_VERSION = 2 as const;

const config_transfer_envelope_schema = z
    .object({
        formatVersion: z.literal(CONFIG_TRANSFER_FORMAT_VERSION),
        exportedAt: z.string().min(1),
        appVersion: z.string(),
        config: z.unknown(),
        secrets: z.record(z.string()).optional(),
    })
    .strict();

export interface ConfigTransferDeps {
    readonly configStore: AppConfigStore;
    readonly secretsStore: SecretsStore;
    readonly definitions?: readonly ConnectorDefinition[] | undefined;
    /** Existing config path; used only to create the pre-import config backup. */
    readonly configPath?: string | undefined;
    /** Encrypted vault snapshot path; production callers must provide this. */
    readonly vaultSnapshotPath?: string | undefined;
    /** Test-only/fallback secret keys when definitions are not available. */
    readonly secretParamKeys?: ReadonlyMap<string, ReadonlySet<string>> | undefined;
}

export interface ConfigTransferExportOptions {
    readonly appVersion: string;
    readonly includeSecrets?: boolean;
    readonly exportedAt?: string;
}

export interface SkippedConfigConnector {
    readonly instanceId: string;
    readonly manifestId: string;
    readonly reason: "unknown-manifest";
}

export interface ConfigTransferImportResult {
    readonly config: AppConfiguration;
    readonly skipped: readonly SkippedConfigConnector[];
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function format_version_label(value: unknown): string {
    if (value === undefined) return "缺失";
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
    }
    try {
        const serialized = JSON.stringify(value) as string | undefined;
        return serialized ?? `<${typeof value}>`;
    } catch {
        return "<不可序列化值>";
    }
}

function secret_keys_for(
    deps: ConfigTransferDeps,
    config: AppConfiguration,
): ReadonlyMap<string, ReadonlySet<string>> {
    return deps.definitions !== undefined
        ? build_secret_param_keys(config, deps.definitions)
        : (deps.secretParamKeys ?? new Map());
}

function strip_secrets(
    config: AppConfiguration,
    secret_keys: ReadonlyMap<string, ReadonlySet<string>>,
): AppConfiguration {
    return {
        ...config,
        plugins: config.plugins.map((plugin) => {
            const keys = secret_keys.get(plugin.instanceId);
            if (!keys || keys.size === 0) return plugin;
            const parameterValues = Object.fromEntries(
                Object.entries(plugin.parameterValues).filter(([key]) => !keys.has(key)),
            );
            return { ...plugin, parameterValues };
        }),
    };
}

function normalize_plugins(
    config: AppConfiguration,
    definitions: readonly ConnectorDefinition[] | undefined,
): { config: AppConfiguration; skipped: readonly SkippedConfigConnector[] } {
    if (definitions === undefined) return { config, skipped: [] };

    const known = new Set(definitions.map((definition) => definition.manifest.id));
    const kept: ConnectorConfiguration[] = [];
    const skipped: SkippedConfigConnector[] = [];
    for (const plugin of config.plugins) {
        if (!known.has(plugin.manifestId)) {
            skipped.push({
                instanceId: plugin.instanceId,
                manifestId: plugin.manifestId,
                reason: "unknown-manifest",
            });
            continue;
        }
        kept.push(plugin);
    }

    return {
        config: {
            ...config,
            plugins: remap_connector_paths(kept, definitions),
        },
        skipped,
    };
}

function belongs_to_active_instance(
    key: string,
    active_instance_ids: ReadonlySet<string>,
): boolean {
    for (const instance_id of active_instance_ids) {
        if (key.startsWith(`${instance_id}:`)) return true;
    }
    return false;
}

function filter_secrets_to_active_instances(
    secrets: Readonly<Record<string, string>>,
    active_instance_ids: ReadonlySet<string>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(secrets).filter(([key]) =>
            belongs_to_active_instance(key, active_instance_ids),
        ),
    );
}

async function backup_config(configPath: string | undefined): Promise<void> {
    if (!configPath) return;
    let raw: string;
    try {
        raw = await readFile(configPath, "utf8");
    } catch (error: unknown) {
        if (
            error instanceof Error &&
            "code" in error &&
            (error as NodeJS.ErrnoException).code === "ENOENT"
        ) {
            return;
        }
        throw error;
    }
    await writeFileAtomic(`${configPath}.bak`, raw);
    log.info(`Backed up previous config to ${configPath}.bak`);
}

async function create_vault_snapshot(deps: ConfigTransferDeps): Promise<boolean> {
    if (!deps.vaultSnapshotPath) return false;
    if (!deps.secretsStore.writeImportSnapshot) {
        throw new Error("vault 不支持导入前加密快照");
    }
    await deps.secretsStore.writeImportSnapshot(deps.vaultSnapshotPath);
    log.info(`Backed up previous vault to ${deps.vaultSnapshotPath}`);
    return true;
}

async function restore_vault(
    deps: ConfigTransferDeps,
    previous_secrets: Record<string, string>,
    snapshot_created: boolean,
): Promise<void> {
    const snapshot_path = deps.vaultSnapshotPath;
    if (snapshot_created && snapshot_path && deps.secretsStore.restoreImportSnapshot) {
        await deps.secretsStore.restoreImportSnapshot(snapshot_path);
        return;
    }
    await deps.secretsStore.importAll(previous_secrets);
}

function parse_transfer_document(raw: unknown): {
    config: AppConfiguration;
    secrets?: Record<string, string>;
} {
    if (!is_record(raw)) {
        throw new Error("导入文件格式无效");
    }
    if (raw["formatVersion"] !== CONFIG_TRANSFER_FORMAT_VERSION) {
        throw new Error(`不支持的导入文件版本: ${format_version_label(raw["formatVersion"])}`);
    }

    const envelope = config_transfer_envelope_schema.safeParse(raw);
    if (!envelope.success) {
        throw new Error(`导入文件格式无效: ${envelope.error.message}`);
    }
    const parsed_config = appConfigurationSchema.safeParse(envelope.data.config);
    if (!parsed_config.success) {
        throw new Error(`导入的配置格式无效: ${parsed_config.error.message}`);
    }
    return {
        config: parsed_config.data as AppConfiguration,
        ...(envelope.data.secrets !== undefined ? { secrets: envelope.data.secrets } : {}),
    };
}

export async function export_config(
    deps: ConfigTransferDeps,
    options: ConfigTransferExportOptions,
): Promise<ConfigExportData> {
    const config = await deps.configStore.load();
    const stripped = strip_secrets(config, secret_keys_for(deps, config));
    const data = {
        formatVersion: CONFIG_TRANSFER_FORMAT_VERSION,
        exportedAt: options.exportedAt ?? new Date().toISOString(),
        appVersion: options.appVersion,
        config: stripped,
        ...(options.includeSecrets ? { secrets: await deps.secretsStore.exportAll() } : {}),
    } satisfies ConfigExportData;
    return data;
}

export async function import_config(
    deps: ConfigTransferDeps,
    raw: unknown,
): Promise<ConfigTransferImportResult> {
    // Everything up to this point is read-only validation and normalization.
    const parsed = parse_transfer_document(raw);
    const normalized = normalize_plugins(parsed.config, deps.definitions);
    const secret_keys = secret_keys_for(deps, normalized.config);
    const stripped = strip_secrets(normalized.config, secret_keys);
    const previous_config = await deps.configStore.load();
    const previous_secrets = await deps.secretsStore.exportAll();
    const active_instance_ids = new Set(stripped.plugins.map((plugin) => plugin.instanceId));
    const target_secrets =
        parsed.secrets === undefined
            ? filter_secrets_to_active_instances(previous_secrets, active_instance_ids)
            : filter_secrets_to_active_instances(parsed.secrets, active_instance_ids);

    // Both snapshots must complete before either config or vault is changed.
    await backup_config(deps.configPath);
    const snapshot_created = await create_vault_snapshot(deps);

    try {
        await deps.configStore.save(stripped);
        await deps.secretsStore.importAll(target_secrets);
    } catch (error: unknown) {
        // Restore both sides even though the file-vault implementation is
        // atomic; test doubles and alternate vaults may fail after a partial
        // in-memory mutation. The real config store save is also serialized,
        // so restoring it here returns the committed state to the pre-import
        // snapshot.
        try {
            await deps.configStore.save(previous_config);
        } catch (restore_config_error: unknown) {
            log.error("Config rollback after failed transfer import failed", restore_config_error);
        }
        try {
            await restore_vault(deps, previous_secrets, snapshot_created);
        } catch (restore_vault_error: unknown) {
            log.error("Vault rollback after failed transfer import failed", restore_vault_error);
        }
        throw error;
    }

    return { config: stripped, skipped: normalized.skipped };
}

/** Default snapshot location for CLI callers that only know config.json. */
export function default_vault_snapshot_path(configPath: string): string {
    return join(configPath.replace(/[\\/][^\\/]+$/, ""), "secrets.vault.import.bak");
}
