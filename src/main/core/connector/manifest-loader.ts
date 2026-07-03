import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import {
    manifest_schema,
    connectorProviderSchema,
    type Manifest,
} from "../../../shared/schemas/manifest";

const log = createLogger("manifest-loader");

export interface ConnectorDefinition {
    readonly directory: string;
    readonly executablePath: string;
    readonly manifest: Manifest;
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
): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const directory = join(dir, entry.name);
        const manifest = await load_manifest(directory);
        if (!manifest) continue;
        if (!connectorProviderSchema.safeParse(manifest.provider).success) {
            log.warn(
                `Skipping connector ${entry.name}: provider "${manifest.provider}" not in connectorProviderSchema`,
            );
            continue;
        }
        definitions.push({ directory, executablePath: directory, manifest });
    }
}

export async function discover_connector_definitions(
    builtin_dir: string,
    user_dir: string,
): Promise<ConnectorDefinition[]> {
    const definitions: ConnectorDefinition[] = [];
    // A missing/unreadable builtin dir is fatal: otherwise the app would launch
    // with zero connectors and no UI signal. Let it propagate to startup.
    if (process.env["E2E_SKIP_BUNDLED"] !== "1") {
        await load_definitions_from_dir(builtin_dir, definitions);
    }
    // The user dir is best-effort: it may not exist until the user adds a connector.
    try {
        await load_definitions_from_dir(user_dir, definitions);
    } catch (err) {
        log.warn("Could not read user connector directory", err);
    }
    return definitions;
}

export async function discover_connectors(
    builtin_dir: string,
    user_dir: string,
): Promise<Manifest[]> {
    return (await discover_connector_definitions(builtin_dir, user_dir)).map(
        (definition) => definition.manifest,
    );
}
