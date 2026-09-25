import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import {
    manifest_schema,
    connectorProviderSchema,
    type Manifest,
} from "../../../shared/schemas/manifest";
import {
    verify_connector_integrity,
    generate_builtin_integrity,
    type IntegrityRegistry,
} from "./connector-integrity";

const log = createLogger("manifest-loader");

export interface ConnectorDefinition {
    readonly directory: string;
    readonly executablePath: string;
    readonly manifest: Manifest;
}

export interface DiscoverOptions {
    readonly allow_user_connectors?: boolean;
    readonly integrity_registry?: IntegrityRegistry;
}

export async function load_manifest(connector_dir: string): Promise<Manifest | null> {
    const path = join(connector_dir, "manifest.json");
    try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        const result = manifest_schema.safeParse(parsed);
        if (!result.success) {
            log.warn(`Invalid manifest in ${connector_dir}: ${result.error.message}`);
            return null;
        }
        return result.data;
    } catch (error) {
        log.warn(`Failed to load manifest from ${connector_dir}`, error);
        return null;
    }
}

async function load_definitions_from_dir(
    dir: string,
    definitions: ConnectorDefinition[],
    is_builtin = false,
    integrity_registry?: IntegrityRegistry,
): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const directory = join(dir, entry.name);
        const manifest = await load_manifest(directory);
        if (!manifest) continue;
        // A129: manifest 为 provider 权威单一来源，仅校验 snake_case 命名格式
        if (!connectorProviderSchema.safeParse(manifest.provider).success) {
            log.warn(
                `Skipping connector ${entry.name}: manifest-declared provider "${manifest.provider}" does not match snake_case pattern`,
            );
            continue;
        }

        // AC-001: 内置连接器进行 SHA-256 完整性清单比对校验
        if (is_builtin && integrity_registry && Object.keys(integrity_registry).length > 0) {
            const check = await verify_connector_integrity(manifest, directory, integrity_registry);
            if (!check.ok) {
                log.error(
                    `Security alert: rejecting connector "${manifest.id}" due to integrity check failure: ${check.reason ?? "unknown"}`,
                );
                continue;
            }
        }

        definitions.push({ directory, executablePath: directory, manifest });
    }
}

export async function discover_connector_definitions(
    builtin_dir: string,
    user_dir: string,
    options?: DiscoverOptions,
): Promise<ConnectorDefinition[]> {
    const definitions: ConnectorDefinition[] = [];
    // A missing/unreadable builtin dir is fatal: otherwise the app would launch
    // with zero connectors and no UI signal. Let it propagate to startup.
    if (process.env["E2E_SKIP_BUNDLED"] !== "1") {
        let registry = options?.integrity_registry;
        // AC-001: 校验内置连接器完整性
        if (!registry && builtin_dir) {
            registry = await generate_builtin_integrity(builtin_dir);
        }
        await load_definitions_from_dir(builtin_dir, definitions, true, registry);
    }
    // AC-003: 默认禁止加载未受信的用户外部目录连接器，必须显式开启信任开关
    if (options?.allow_user_connectors) {
        try {
            await load_definitions_from_dir(user_dir, definitions, false);
        } catch (err) {
            log.warn("Could not read user connector directory", err);
        }
    } else {
        log.debug(
            "Skipping user connector directory (untrusted user connectors disabled by default)",
        );
    }
    return definitions;
}

export async function discover_connectors(
    builtin_dir: string,
    user_dir: string,
    options?: DiscoverOptions,
): Promise<Manifest[]> {
    return (await discover_connector_definitions(builtin_dir, user_dir, options)).map(
        (definition) => definition.manifest,
    );
}
